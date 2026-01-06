/**
 * Role-Based Access Control (RBAC) Middleware
 * Defines permissions for each role and provides utilities for permission checking
 */

export type UserRole = 'CANDIDATE' | 'EMPLOYEE' | 'HR' | 'SYSTEM_ADMIN';

export type Permission =
    // HR & Admin Permissions
    | 'VIEW_ALL_CANDIDATES'
    | 'MANAGE_EMPLOYEES'
    | 'CONFIGURE_AI'
    | 'VIEW_AI_ANALYTICS'
    // Candidate Permissions
    | 'VIEW_OWN_APPLICATION'
    | 'SUBMIT_APPLICATION'
    | 'START_AI_INTERVIEW'
    | 'VIEW_OWN_RESULTS'
    // Employee Permissions
    | 'VIEW_ASSIGNED_CANDIDATES'
    | 'SCHEDULE_INTERVIEWS';

// ============================================================================
// Permission Definitions
// ============================================================================

export const PERMISSIONS: Record<Permission, UserRole[]> = {
    // HR & Admin Permissions
    VIEW_ALL_CANDIDATES: ['HR', 'SYSTEM_ADMIN'],
    MANAGE_EMPLOYEES: ['HR', 'SYSTEM_ADMIN'],
    CONFIGURE_AI: ['HR', 'SYSTEM_ADMIN'],
    VIEW_AI_ANALYTICS: ['HR', 'SYSTEM_ADMIN'],

    // Candidate Permissions
    VIEW_OWN_APPLICATION: ['CANDIDATE'],
    SUBMIT_APPLICATION: ['CANDIDATE'],
    START_AI_INTERVIEW: ['CANDIDATE'],
    VIEW_OWN_RESULTS: ['CANDIDATE'],

    // Employee Permissions
    VIEW_ASSIGNED_CANDIDATES: ['EMPLOYEE', 'HR', 'SYSTEM_ADMIN'],
    SCHEDULE_INTERVIEWS: ['EMPLOYEE', 'HR', 'SYSTEM_ADMIN'],
};

// ============================================================================
// Permission Checking Functions
// ============================================================================

export function hasPermission(role: UserRole, permission: Permission): boolean {
    const allowedRoles = PERMISSIONS[permission];
    return allowedRoles.includes(role);
}

export function hasAnyPermission(role: UserRole, permissions: Permission[]): boolean {
    return permissions.some(permission => hasPermission(role, permission));
}

export function hasAllPermissions(role: UserRole, permissions: Permission[]): boolean {
    return permissions.every(permission => hasPermission(role, permission));
}

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
    {
        path: '/hr',
        allowedRoles: ['HR', 'SYSTEM_ADMIN'],
        requiredPermissions: ['VIEW_ALL_CANDIDATES'],
    },
    {
        path: '/admin',
        allowedRoles: ['SYSTEM_ADMIN'],
    },
    {
        path: '/hr/ai-config',
        allowedRoles: ['HR', 'SYSTEM_ADMIN'],
        requiredPermissions: ['CONFIGURE_AI'],
    },
    {
        path: '/hr/analytics',
        allowedRoles: ['HR', 'SYSTEM_ADMIN'],
        requiredPermissions: ['VIEW_AI_ANALYTICS'],
    },
    {
        path: '/employee-interviews',
        allowedRoles: ['EMPLOYEE', 'HR', 'SYSTEM_ADMIN'],
        requiredPermissions: ['VIEW_ASSIGNED_CANDIDATES'],
    },
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

export function canAccessRoute(role: UserRole, path: string): boolean {
    const routePermission = ROUTE_PERMISSIONS.find(route =>
        path.startsWith(route.path)
    );

    if (!routePermission) {
        return true;
    }

    if (!routePermission.allowedRoles.includes(role)) {
        return false;
    }

    if (routePermission.requiredPermissions) {
        return hasAllPermissions(role, routePermission.requiredPermissions);
    }

    return true;
}

export function getDefaultDashboardRoute(role: UserRole): string {
    switch (role) {
        case 'HR':
            return '/hr';
        case 'SYSTEM_ADMIN':
            return '/admin';
        case 'EMPLOYEE':
            return '/employee-interviews';
        case 'CANDIDATE':
            return '/candidate-portal';
        default:
            return '/auth/login';
    }
}

export function getUnauthorizedRedirect(role: UserRole): string {
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

export function canCallApi(
    role: UserRole,
    method: string,
    path: string
): boolean {
    const apiPermission = API_PERMISSIONS.find(
        api => api.method === method && matchPath(api.path, path)
    );

    if (!apiPermission) {
        return true;
    }

    return hasAllPermissions(role, apiPermission.requiredPermissions);
}

function matchPath(pattern: string, path: string): boolean {
    const patternParts = pattern.split('/');
    const pathParts = path.split('/');

    if (patternParts.length !== pathParts.length) {
        return false;
    }

    return patternParts.every((part, index) => {
        return part.startsWith(':') || part === pathParts[index];
    });
}
