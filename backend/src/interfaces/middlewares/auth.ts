import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { db } from '../../config/db';

const JWT_SECRET = process.env.JWT_SECRET || 'busywms-secret-key-12345';

export interface AuthenticatedRequest extends Request {
  user?: {
    userId: number;
    username: string;
    role: string;
    roleId?: number;
    warehouseId?: number;
  };
}

export const authenticateJWT = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  let token = req.cookies?.access_token;
  
  if (!token) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    }
  }

  if (!token) {
    return res.status(401).json({ message: 'Authorization token required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    req.user = {
      userId: decoded.userId,
      username: decoded.username,
      role: decoded.role,
      roleId: decoded.roleId,
      warehouseId: decoded.warehouseId
    };
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
};

export const requireRoles = (allowedRoles: string[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthenticated' });
    }

    if (!allowedRoles.includes(req.user.role) && req.user.role !== 'Admin') {
      return res.status(403).json({ message: 'Access denied: Insufficient permissions' });
    }

    next();
  };
};

// Middleware to check if a feature is enabled in system settings
export const requireFeature = (featureCode: string) => {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const config = await db.query('SELECT IsEnabled FROM tblFeatureConfig WHERE FeatureCode = @featureCode', { featureCode });
      if (config.length > 0 && config[0].IsEnabled === 0) {
        return res.status(403).json({ 
          message: `Feature '${featureCode}' is currently disabled. Admin can enable it in Settings.` 
        });
      }
      next();
    } catch (err: any) {
      return res.status(500).json({ message: 'Error checking feature config', error: err.message });
    }
  };
};

// Middleware to check dynamic RBAC permissions using the matrix table
export const requirePermission = (resource: string, action: 'read' | 'create' | 'update' | 'delete') => {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthenticated' });
    }

    if (req.user.role === 'Admin') {
      return next(); // System Admins bypass permission rules
    }

    try {
      let roleId = req.user.roleId;
      if (!roleId) {
        const users = await db.query('SELECT RoleId FROM tblUser WHERE UserId = @userId', { userId: req.user.userId });
        if (users.length === 0) {
          return res.status(403).json({ message: 'User role resolution failed' });
        }
        roleId = users[0].RoleId;
        req.user.roleId = roleId; // Cache for downstream
      }

      const colMap = {
        read: 'CanRead',
        create: 'CanCreate',
        update: 'CanUpdate',
        delete: 'CanDelete'
      };
      const colName = colMap[action];

      const perm = await db.query(`
        SELECT ${colName} AS allowed 
        FROM tblPermissionMatrix 
        WHERE RoleId = @roleId AND ResourceName = @resource
      `, { roleId, resource });

      if (perm.length === 0 || perm[0].allowed === 0) {
        return res.status(403).json({ 
          message: `Access denied: You do not have permission to ${action} ${resource}.` 
        });
      }

      next();
    } catch (err: any) {
      return res.status(500).json({ message: 'Error checking RBAC permission matrix', error: err.message });
    }
  };
};
