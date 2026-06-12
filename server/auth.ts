import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { UserRole } from "./database";

// Extend Request interface to support req.user custom field in Express
export interface AuthenticatedRequest extends Request {
  user?: {
    id: number;
    name: string;
    email: string;
    role: UserRole;
    department: string;
  };
}

export const JWT_SECRET = process.env.JWT_SECRET || "VIIT_SECRET_SYSTEM_CELL_2026_KEY";

export function verifyToken(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "Access token required. Please sign in." });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as {
      id: number;
      name: string;
      email: string;
      role: UserRole;
      department: string;
    };
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ error: "Invalid or expired session token. Please re-authenticate." });
  }
}

export function authorize(allowedRoles: UserRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required." });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ 
        error: `Access Denied. Required roles: [${allowedRoles.join(", ")}]. Your role: '${req.user.role}'` 
      });
    }

    next();
  };
}
