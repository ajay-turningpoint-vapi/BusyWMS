import { Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db } from '../../config/db';
import { AuthenticatedRequest } from '../middlewares/auth';

const JWT_SECRET = process.env.JWT_SECRET || 'busywms-secret-key-12345';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '2h';

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

      // Generate JWT Token with roleId
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

      return res.json({
        token,
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
