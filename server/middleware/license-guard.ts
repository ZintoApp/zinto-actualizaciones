import { Request, Response, NextFunction } from 'express';
import { licenseValidator } from '../services/license-validator';
import { logger } from '../utils/logger';

export const ensureLicenseValid = async (req: Request, res: Response, next: NextFunction) => {
  if (process.env.NODE_ENV !== 'production') {
    return next();
  }

  if (process.env.SKIP_LICENSE_CHECK === 'true') {
    return next();
  }


  const isAdminApiRoute = req.path.startsWith('/api/admin');
  const isAdminPageRoute = req.path.startsWith('/admin') && !req.path.startsWith('/admin/login') && !req.path.startsWith('/admin/forgot-password') && !req.path.startsWith('/admin/reset-password');
  
  if (!isAdminApiRoute && !isAdminPageRoute) {
    return next();
  }


  const validation = await licenseValidator.validateLicense();

  if (!validation.valid) {
    const reason = validation.reason || 'License validation failed';
    
    logger.warn('license', `License validation failed: ${reason}`, {
      path: req.path,
      ip: req.ip,
      userAgent: req.get('user-agent'),
      timestamp: new Date().toISOString()
    });


    if (isAdminApiRoute) {
      const response: {
        message: string;
        licenseExpired?: boolean;
        ipNotAllowed?: boolean;
      } = {
        message: 'Please renew your license. If you think this is a mistake, please contact support.'
      };

      if (reason === 'License expired') {
        response.licenseExpired = true;
      } else if (reason === 'Server IP address is not authorized') {
        response.ipNotAllowed = true;
      }

      return res.status(403).json(response);
    }


    return res.status(403).send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>License Error</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            margin: 0;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: #333;
          }
          .container {
            background: white;
            padding: 2rem;
            border-radius: 8px;
            box-shadow: 0 10px 25px rgba(0,0,0,0.2);
            max-width: 500px;
            text-align: center;
          }
          h1 {
            color: #e74c3c;
            margin-top: 0;
          }
          p {
            line-height: 1.6;
            color: #666;
          }
          .error-details {
            background: #f8f9fa;
            padding: 1rem;
            border-radius: 4px;
            margin-top: 1rem;
            font-size: 0.9rem;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>⚠️ License Error</h1>
          <p>Access to the admin panel is restricted due to a license issue.</p>
          <div class="error-details">
            <p><strong>Reason:</strong> ${reason}</p>
            <p>Please renew your license or contact support for assistance.</p>
          </div>
        </div>
      </body>
      </html>
    `);
  }

  logger.debug('license', 'License validation passed', {
    path: req.path,
    ip: req.ip
  });

  next();
};

