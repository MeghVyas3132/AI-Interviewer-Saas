/**
 * Role-Based Access Control (RBAC) Middleware
 * Defines permissions for each role and provides utilities for permission checking
 */

import { UserRole, Permission } from '../ai-shared/types';

// ============================================================================
// Permission Definitions
// ============================================================================

export const PERMISSIONS: Record<Permission, UserRole[]> = {
    // HR & Admin Permissions
    VIEW_ALL_CANDIDATES: ['HR', 'ADMIN', 'SYSTEM_ADMIN'],
    MANAGE_EMPLOYEES: ['HR', 'ADMIN', 'SYSTEM_ADMIN'],
    CONFIGURE_AI: ['HR', 'ADMIN', 'SYSTEM_ADMIN'],
    VIEW_AI_ANALYTICS: ['HR', 'ADMIN', 'SYSTEM_ADMIN'],

    // Candidate Permissions
    VIEW_OWN_APPLICATION: ['CANDIDATE'],
    START_AI_INTERVIEW: ['CANDIDATE'],
    VIEW_OWN_RESULTS: ['CANDIDATE'],

    // Employee Permissions
    VIEW_ASSIGNED_CANDIDATES: ['EMPLOYEE', 'TEAM_LEAD', 'HR', 'ADMIN', 'SYSTEM_ADMIN'],
    SCHEDULE_INTERVIEWS: ['EMPLOYEE', 'TEAM_LEAD', 'HR', 'ADMIN', 'SYSTEM_ADMIN'],
};

// ============================================================================
// Permission Checking Functions
// ============================================================================

/**
 * Check if a role has a specific permission
 */
export function hasPermission(role: UserRole, permission: Permission): boolean {
    const allowedRoles = PERMISSIONS[permission];
    return allowedRoles.includes(role);
}

/**
 * Check if a role has any of the specified permissions
 */
export function hasAnyPermission(role: UserRole, permissions: Permission[]): boolean {
    return permissions.some(permission => hasPermission(role, permission));
}

/**
 * Check if a role has all of the specified permissions
 */
export function hasAllPermissions(role: UserRole, permissions: Permission[]): boolean {
    return permissions.every(permission => hasPermission(role, permission));
}

/**
 * Get all permissions for a specific role
 */
export function getRolePermissions(role: UserRole): Permission[] {
    return Object.entries(PERMISSIONS)
        .filter(([_, roles]) => roles.includes(role))
        .map(([permission]) => permission as Permission);
}

// ============================================================================
// Route Access Control
// ============================================================================

export interface RoutePermission {
    path: string;
    allowedRoles: UserRole[];
    requiredPermissions?: Permission[];
}

export const ROUTE_PERMISSIONS: RoutePermission[] = [
    // HR Routes
    {
        path: '/hr',
        allowedRoles: ['HR', 'ADMIN', 'SYSTEM_ADMIN'],
        requiredPermissions: ['VIEW_ALL_CANDIDATES'],
    },
    {
        path: '/hr/ai-config',
        allowedRoles: ['HR', 'ADMIN', 'SYSTEM_ADMIN'],
        requiredPermissions: ['CONFIGURE_AI'],
    },
    {
        path: '/hr/analytics',
        allowedRoles: ['HR', 'ADMIN', 'SYSTEM_ADMIN'],
        requiredPermissions: ['VIEW_AI_ANALYTICS'],
    },

    // Employee Routes
    {
        path: '/employee-interviews',
        allowedRoles: ['EMPLOYEE', 'TEAM_LEAD', 'HR', 'ADMIN', 'SYSTEM_ADMIN'],
        requiredPermissions: ['VIEW_ASSIGNED_CANDIDATES'],
    },

    // Candidate Routes
    {
        path: '/candidate-portal',
        allowedRoles: ['CANDIDATE'],
        requiredPermissions: ['VIEW_OWN_APPLICATION'],
    },
    {
        path: '/interview',
        allowedRoles: ['CANDIDATE'],
        requiredPermissions: ['START_AI_INTERVIEW'],
    },
];

/**
 * Check if a role can access a specific route
 */
export function canAccessRoute(role: UserRole, path: string): boolean {
    const routePermission = ROUTE_PERMISSIONS.find(route =>
        path.startsWith(route.path)
    );

    if (!routePermission) {
        // If route not defined in permissions, allow by default (can be changed to deny by default)
        return true;
    }

    // Check if role is allowed
    if (!routePermission.allowedRoles.includes(role)) {
        return false;
    }

    // Check required permissions if any
    if (routePermission.requiredPermissions) {
        return hasAllPermissions(role, routePermission.requiredPermissions);
    }

    return true;
}

/**
 * Get the default dashboard route for a role
 */
export function getDefaultDashboardRoute(role: UserRole): string {
    switch (role) {
        case 'HR':
        case 'ADMIN':
        case 'SYSTEM_ADMIN':
            return '/hr';
        case 'EMPLOYEE':
        case 'TEAM_LEAD':
            return '/employee-interviews';
        case 'CANDIDATE':
            return '/candidate-portal';
        default:
            return '/auth/login';
    }
}

/**
 * Get unauthorized redirect path
 */
export function getUnauthorizedRedirect(role: UserRole): string {
    // Redirect to their default dashboard if accessing unauthorized route
    return getDefaultDashboardRoute(role);
}

// ============================================================================
// API Endpoint Permissions (for frontend validation)
// ============================================================================

export interface ApiEndpointPermission {
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
    path: string;
    requiredPermissions: Permission[];
}

export const API_PERMISSIONS: ApiEndpointPermission[] = [
    // Candidate Management
    {
        method: 'GET',
        path: '/api/v1/candidates',
        requiredPermissions: ['VIEW_ALL_CANDIDATES'],
    },
    {
        method: 'POST',
        path: '/api/v1/candidates',
        requiredPermissions: ['VIEW_ALL_CANDIDATES'],
    },
    {
        method: 'DELETE',
        path: '/api/v1/candidates/:id',
        requiredPermissions: ['VIEW_ALL_CANDIDATES'],
    },

    // Employee Management
    {
        method: 'GET',
        path: '/api/v1/hr/employees',
        requiredPermissions: ['MANAGE_EMPLOYEES'],
    },
    {
        method: 'POST',
        path: '/api/v1/hr/employees',
        requiredPermissions: ['MANAGE_EMPLOYEES'],
    },

    // AI Configuration
    {
        method: 'GET',
        path: '/api/v1/ai/config',
        requiredPermissions: ['CONFIGURE_AI'],
    },
    {
        method: 'POST',
        path: '/api/v1/ai/config',
        requiredPermissions: ['CONFIGURE_AI'],
    },

    // Interview Management
    {
        method: 'POST',
        path: '/api/v1/ai/interview/start',
        requiredPermissions: ['START_AI_INTERVIEW'],
    },
    {
        method: 'GET',
        path: '/api/v1/employee/my-candidates',
        requiredPermissions: ['VIEW_ASSIGNED_CANDIDATES'],
    },
];

/**
 * Check if a role can call a specific API endpoint
 */
export function canCallApi(
    role: UserRole,
    method: string,
    path: string
): boolean {
    const apiPermission = API_PERMISSIONS.find(
        api => api.method === method && matchPath(api.path, path)
    );

    if (!apiPermission) {
        // If not defined, allow (can be changed to deny by default)
        return true;
    }

    return hasAllPermissions(role, apiPermission.requiredPermissions);
}

/**
 * Simple path matching for API routes (supports :id params)
 */
function matchPath(pattern: string, path: string): boolean {
    const patternParts = pattern.split('/');
    const pathParts = path.split('/');

    if (patternParts.length !== pathParts.length) {
        return false;
    }

    return patternParts.every((part, i) => {
        if (part.startsWith(':')) {
            return true; // Param match
        }
        return part === pathParts[i];
    });
}
