import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { db } from '../../config/db';
import { AuthenticatedRequest } from '../middlewares/auth';

const JWT_SECRET = process.env.JWT_SECRET || 'busywms-secret-key-12345';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '15m'; // Access token is short-lived

export class AuthController {
  
  public static async login(req: AuthenticatedRequest, res: Response) {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ message: 'Username and password are required' });
    }

    try {
      // Find user and join role
      const users = await db.query(`
        SELECT u.UserId, u.Username, u.PasswordHash, u.FullName, u.WarehouseId, u.IsActive, r.RoleName, u.RoleId
        FROM tblUser u
        INNER JOIN tblRole r ON u.RoleId = r.RoleId
        WHERE u.Username = @username
      `, { username });

      if (users.length === 0) {
        return res.status(401).json({ message: 'Invalid username or password' });
      }

      const user = users[0];
      if (!user.IsActive) {
        return res.status(403).json({ message: 'User account is inactive' });
      }

      const isMatch = await bcrypt.compare(password, user.PasswordHash);
      if (!isMatch) {
        // Log failed password attempt in login history
        await db.executeCmd(`
          INSERT INTO tblLoginHistory (UserId, IPAddress, Browser, Status, FailureReason)
          VALUES (@userId, @ip, @browser, 'FAILED', 'Invalid Password')
        `, { 
          userId: user.UserId, 
          ip: req.ip || 'UNKNOWN', 
          browser: req.headers['user-agent'] || 'UNKNOWN' 
        });

        return res.status(401).json({ message: 'Invalid username or password' });
      }

      // Generate JWT Access Token
      const token = jwt.sign(
        { 
          userId: user.UserId, 
          username: user.Username, 
          role: user.RoleName, 
          roleId: user.RoleId,
          warehouseId: user.WarehouseId 
        },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN as any }
      );

      // Generate Refresh Token
      const refreshToken = crypto.randomBytes(64).toString('hex');
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7); // 7 days expiry

      await db.executeCmd(`
        INSERT INTO tblRefreshToken (UserId, Token, ExpiresAt, Revoked)
        VALUES (@userId, @token, @expiresAt, 0)
      `, { userId: user.UserId, token: refreshToken, expiresAt });

      // Audit Log Login
      await db.executeCmd(`
        INSERT INTO tblAuditLog (UserId, Action, TableName, RecordId, IPAddress)
        VALUES (@userId, 'LOGIN', 'tblUser', @userId, @ip)
      `, { userId: user.UserId, ip: req.ip || 'UNKNOWN' });

      // Insert Login History Success
      await db.executeCmd(`
        INSERT INTO tblLoginHistory (UserId, IPAddress, Browser, Status)
        VALUES (@userId, @ip, @browser, 'SUCCESS')
      `, { 
        userId: user.UserId, 
        ip: req.ip || 'UNKNOWN', 
        browser: req.headers['user-agent'] || 'UNKNOWN' 
      });

      // Fetch permissions for this role
      const permissions = await db.query(`
        SELECT ResourceName, CanRead, CanCreate, CanUpdate, CanDelete 
        FROM tblPermissionMatrix 
        WHERE RoleId = @roleId
      `, { roleId: user.RoleId });

      // Set cookies
      res.cookie('access_token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 15 * 60 * 1000 // 15 mins
      });

      res.cookie('refresh_token', refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
      });

      return res.json({
        message: 'Logged in successfully',
        token,
        refreshToken,
        user: {
          userId: user.UserId,
          username: user.Username,
          fullName: user.FullName,
          role: user.RoleName,
          warehouseId: user.WarehouseId,
          permissions
        }
      });
    } catch (err: any) {
      console.error('Login error:', err);
      return res.status(500).json({ message: 'Internal server error', error: err.message });
    }
  }

  public static async refresh(req: Request, res: Response) {
    const refreshToken = req.cookies?.refresh_token;

    if (!refreshToken) {
      return res.status(401).json({ message: 'No refresh token provided' });
    }

    try {
      // Find the token in the database
      const rows = await db.query(`
        SELECT r.TokenId, r.UserId, r.ExpiresAt, r.Revoked,
               u.Username, u.FullName, u.WarehouseId, u.IsActive, u.RoleId, role.RoleName
        FROM tblRefreshToken r
        INNER JOIN tblUser u ON r.UserId = u.UserId
        INNER JOIN tblRole role ON u.RoleId = role.RoleId
        WHERE r.Token = @token
      `, { token: refreshToken });

      if (rows.length === 0) {
        return res.status(401).json({ message: 'Invalid refresh token' });
      }

      const tokenRecord = rows[0];

      if (tokenRecord.Revoked) {
        return res.status(401).json({ message: 'Refresh token is revoked' });
      }

      if (new Date() > new Date(tokenRecord.ExpiresAt)) {
        return res.status(401).json({ message: 'Refresh token has expired' });
      }

      if (!tokenRecord.IsActive) {
        return res.status(403).json({ message: 'User account is inactive' });
      }

      // Valid refresh token -> issue new access token
      const token = jwt.sign(
        { 
          userId: tokenRecord.UserId, 
          username: tokenRecord.Username, 
          role: tokenRecord.RoleName, 
          roleId: tokenRecord.RoleId,
          warehouseId: tokenRecord.WarehouseId 
        },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN as any }
      );

      res.cookie('access_token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 15 * 60 * 1000 // 15 mins
      });

      return res.json({ message: 'Token refreshed successfully' });
    } catch (err: any) {
      console.error('Refresh token error:', err);
      return res.status(500).json({ message: 'Internal server error', error: err.message });
    }
  }

  public static async logout(req: Request, res: Response) {
    const refreshToken = req.cookies?.refresh_token;

    try {
      if (refreshToken) {
        await db.executeCmd(`
          UPDATE tblRefreshToken
          SET Revoked = 1
          WHERE Token = @token
        `, { token: refreshToken });
      }

      res.clearCookie('access_token');
      res.clearCookie('refresh_token');

      return res.json({ message: 'Logged out successfully' });
    } catch (err: any) {
      console.error('Logout error:', err);
      return res.status(500).json({ message: 'Internal server error', error: err.message });
    }
  }

  public static async register(req: AuthenticatedRequest, res: Response) {
    const { username, email, password, roleName, fullName, warehouseId } = req.body;

    if (!username || !email || !password || !roleName || !fullName) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    try {
      // Check if user exists
      const existing = await db.query('SELECT UserId FROM tblUser WHERE Username = @username OR Email = @email', { username, email });
      if (existing.length > 0) {
        return res.status(400).json({ message: 'Username or email already exists' });
      }

      // Find role
      const roles = await db.query('SELECT RoleId FROM tblRole WHERE RoleName = @roleName', { roleName });
      if (roles.length === 0) {
        return res.status(400).json({ message: 'Invalid role name' });
      }

      const roleId = roles[0].RoleId;
      const hashedPassword = await bcrypt.hash(password, 10);

      const result = await db.executeCmd(`
        INSERT INTO tblUser (Username, Email, PasswordHash, RoleId, FullName, WarehouseId, IsActive)
        VALUES (@username, @email, @hashedPassword, @roleId, @fullName, @warehouseId, 1)
      `, { username, email, hashedPassword, roleId, fullName, warehouseId: warehouseId || null });

      return res.status(201).json({ message: 'User registered successfully', userId: result.lastID });
    } catch (err: any) {
      console.error('Registration error:', err);
      return res.status(500).json({ message: 'Internal server error', error: err.message });
    }
  }

  public static async getProfile(req: AuthenticatedRequest, res: Response) {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    
    try {
      const users = await db.query(`
        SELECT u.UserId, u.Username, u.Email, u.FullName, u.WarehouseId, r.RoleName, u.RoleId
        FROM tblUser u
        INNER JOIN tblRole r ON u.RoleId = r.RoleId
        WHERE u.UserId = @userId
      `, { userId: req.user.userId });

      if (users.length === 0) {
        return res.status(404).json({ message: 'User not found' });
      }

      const user = users[0];
      const permissions = await db.query(`
        SELECT ResourceName, CanRead, CanCreate, CanUpdate, CanDelete 
        FROM tblPermissionMatrix 
        WHERE RoleId = @roleId
      `, { roleId: user.RoleId });

      return res.json({
        userId: user.UserId,
        username: user.Username,
        email: user.Email,
        fullName: user.FullName,
        warehouseId: user.WarehouseId,
        role: user.RoleName,
        permissions
      });
    } catch (err: any) {
      return res.status(500).json({ message: 'Error retrieving profile', error: err.message });
    }
  }
}
