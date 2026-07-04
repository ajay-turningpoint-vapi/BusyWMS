import { Response } from 'express';
import { db } from '../../config/db';
import { AuthenticatedRequest } from '../middlewares/auth';

export class SettingController {

  // ==========================================
  // FEATURE CONFIGURATION CRUD
  // ==========================================
  
  public static async getFeatures(req: AuthenticatedRequest, res: Response) {
    try {
      const rows = await db.query('SELECT * FROM tblFeatureConfig ORDER BY Category, FeatureCode');
      return res.json(rows);
    } catch (err: any) {
      return res.status(500).json({ message: 'Failed to retrieve feature config', error: err.message });
    }
  }

  public static async updateFeatures(req: AuthenticatedRequest, res: Response) {
    const { features } = req.body; // Array of { FeatureCode, IsEnabled }
    const userId = req.user?.userId || 1;

    if (!features || !Array.isArray(features)) {
      return res.status(400).json({ message: 'Invalid features payload. Must be an array.' });
    }

    try {
      for (const item of features) {
        await db.executeCmd(`
          UPDATE tblFeatureConfig 
          SET IsEnabled = @isEnabled, UpdatedBy = @userId 
          WHERE FeatureCode = @featureCode
        `, { 
          isEnabled: item.IsEnabled ? 1 : 0, 
          featureCode: item.FeatureCode,
          userId 
        });
      }
      return res.json({ message: 'Features updated successfully' });
    } catch (err: any) {
      return res.status(500).json({ message: 'Failed to update features', error: err.message });
    }
  }

  // ==========================================
  // USER DEFINED SETTINGS CRUD
  // ==========================================

  public static async getSettings(req: AuthenticatedRequest, res: Response) {
    try {
      const rows = await db.query('SELECT * FROM tblUserSetting ORDER BY SettingKey');
      return res.json(rows);
    } catch (err: any) {
      return res.status(500).json({ message: 'Failed to retrieve settings', error: err.message });
    }
  }

  public static async updateSettings(req: AuthenticatedRequest, res: Response) {
    const { settings } = req.body;
    
    if (!settings) {
      return res.status(400).json({ message: 'Invalid settings payload.' });
    }

    try {
      if (Array.isArray(settings)) {
        for (const item of settings) {
          const key = item.key || item.SettingKey;
          const value = item.value || item.SettingValue;
          if (key) {
            await db.executeCmd(`
              UPDATE tblUserSetting 
              SET SettingValue = @value 
              WHERE SettingKey = @key
            `, { value: value !== undefined && value !== null ? String(value) : '', key });
          }
        }
      } else if (typeof settings === 'object') {
        for (const key in settings) {
          await db.executeCmd(`
            UPDATE tblUserSetting 
            SET SettingValue = @value 
            WHERE SettingKey = @key
          `, { value: String(settings[key]), key });
        }
      } else {
        return res.status(400).json({ message: 'Invalid settings format.' });
      }
      return res.json({ message: 'Settings updated successfully' });
    } catch (err: any) {
      return res.status(500).json({ message: 'Failed to update settings', error: err.message });
    }
  }

  // ==========================================
  // PERMISSION MATRIX CRUD
  // ==========================================

  public static async getPermissions(req: AuthenticatedRequest, res: Response) {
    try {
      const rows = await db.query(`
        SELECT pm.*, r.RoleName 
        FROM tblPermissionMatrix pm
        INNER JOIN tblRole r ON pm.RoleId = r.RoleId
        ORDER BY pm.RoleId, pm.ResourceName
      `);
      return res.json(rows);
    } catch (err: any) {
      return res.status(500).json({ message: 'Failed to retrieve permissions', error: err.message });
    }
  }

  public static async updatePermissions(req: AuthenticatedRequest, res: Response) {
    const { permissions } = req.body; // Array of { RoleId, ResourceName, CanRead, CanCreate, CanUpdate, CanDelete }

    if (!permissions || !Array.isArray(permissions)) {
      return res.status(400).json({ message: 'Invalid permissions payload. Must be an array.' });
    }

    try {
      for (const item of permissions) {
        await db.executeCmd(`
          INSERT INTO tblPermissionMatrix (RoleId, ResourceName, CanRead, CanCreate, CanUpdate, CanDelete)
          VALUES (@roleId, @resourceName, @canRead, @canCreate, @canUpdate, @canDelete)
          ON DUPLICATE KEY UPDATE 
            CanRead = @canRead, 
            CanCreate = @canCreate, 
            CanUpdate = @canUpdate, 
            CanDelete = @canDelete
        `, {
          roleId: item.RoleId,
          resourceName: item.ResourceName,
          canRead: item.CanRead ? 1 : 0,
          canCreate: item.CanCreate ? 1 : 0,
          canUpdate: item.CanUpdate ? 1 : 0,
          canDelete: item.CanDelete ? 1 : 0
        });
      }
      return res.json({ message: 'Permissions matrix updated successfully' });
    } catch (err: any) {
      console.error('Failed to update permissions:', err);
      return res.status(500).json({ message: 'Failed to update permissions matrix', error: err.message });
    }
  }

  // ==========================================
  // SECURITY AUDIT LOGS & LOGIN HISTORY
  // ==========================================

  public static async getLoginHistory(req: AuthenticatedRequest, res: Response) {
    try {
      const rows = await db.query(`
        SELECT lh.*, u.FullName, u.Username
        FROM tblLoginHistory lh
        LEFT JOIN tblUser u ON lh.UserId = u.UserId
        ORDER BY lh.LoginLogId DESC
        LIMIT 100
      `);
      return res.json(rows);
    } catch (err: any) {
      return res.status(500).json({ message: 'Failed to retrieve login history', error: err.message });
    }
  }
}
