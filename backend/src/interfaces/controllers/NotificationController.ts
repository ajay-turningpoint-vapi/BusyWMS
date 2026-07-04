import { Response } from 'express';
import { db } from '../../config/db';
import { AuthenticatedRequest } from '../middlewares/auth';

export class NotificationController {

  // Get notifications for current logged in user and broadcast notices
  public static async getNotifications(req: AuthenticatedRequest, res: Response) {
    const userId = req.user?.userId || 1;
    try {
      const rows = await db.query(`
        SELECT * FROM tblNotification 
        WHERE UserId = @userId OR UserId IS NULL 
        ORDER BY NotificationId DESC 
        LIMIT 50
      `, { userId });
      return res.json(rows);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  }

  // Mark a specific notification as read
  public static async markAsRead(req: AuthenticatedRequest, res: Response) {
    const { id } = req.params;
    try {
      await db.executeCmd(`
        UPDATE tblNotification SET IsRead = 1 WHERE NotificationId = @id
      `, { id });
      return res.json({ message: 'Notification marked as read' });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  }

  // Mark all notifications as read for the current user
  public static async markAllRead(req: AuthenticatedRequest, res: Response) {
    const userId = req.user?.userId || 1;
    try {
      await db.executeCmd(`
        UPDATE tblNotification SET IsRead = 1 WHERE UserId = @userId OR UserId IS NULL
      `, { userId });
      return res.json({ message: 'All notifications marked as read' });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  }
}
