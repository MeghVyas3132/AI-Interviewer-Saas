/**
 * Permission Guard Component
 * Conditionally renders children based on user permissions
 * 
 * Usage:
 * <PermissionGuard permission="VIEW_ALL_CANDIDATES">
 *   <AdminOnlyFeature />
 * </PermissionGuard>
 */

'use client';

import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Permission } from '@/components/ai-shared/types';

export interface PermissionGuardProps {
    /** Single permission to check */
    permission?: Permission;
    /** Multiple permissions to check */
    permissions?: Permission[];
    /** If true, user must have ALL permissions; otherwise ANY permission */
    requireAll?: boolean;
    /** Content to show when user doesn't have permission */
    fallback?: React.ReactNode;
    /** Content to show when user has permission */
    children: React.ReactNode;
    /** Optional custom check function */
    customCheck?: () => boolean;
}

/**
 * Component that guards content based on user permissions
 */
export function PermissionGuard({
    permission,
    permissions,
    requireAll = false,
    fallback = null,
    children,
    customCheck,
}: PermissionGuardProps) {
    const { user, hasPermission, hasAnyPermission, hasAllPermissions } = useAuth();

    // User must be authenticated
    if (!user) {
        return <>{fallback}</>;
    }

    // Custom check function takes precedence
    if (customCheck) {
        return <>{customCheck() ? children : fallback}</>;
    }

    let hasAccess = false;

    // Check single permission
    if (permission) {
        hasAccess = hasPermission(permission);
    }
    // Check multiple permissions
    else if (permissions && permissions.length > 0) {
        hasAccess = requireAll
            ? hasAllPermissions(permissions)
            : hasAnyPermission(permissions);
    }
    // No permissions specified = allow access
    else {
        hasAccess = true;
    }

    return <>{hasAccess ? children : fallback}</>;
}

/**
 * Role Guard Component
 * Simpler guard that checks user role directly
 */
export interface RoleGuardProps {
    /** Allowed roles */
    roles: string[];
    /** Fallback content */
    fallback?: React.ReactNode;
    /** Content to show when user has correct role */
    children: React.ReactNode;
}

export function RoleGuard({ roles, fallback = null, children }: RoleGuardProps) {
    const { user } = useAuth();

    if (!user || !roles.includes(user.role)) {
        return <>{fallback}</>;
    }

    return <>{children}</>;
}

/**
 * Feature Flag Guard
 * Can be used to toggle features based on environment or configuration
 */
export interface FeatureFlagGuardProps {
    /** Feature flag name */
    flag: string;
    /** Fallback content */
    fallback?: React.ReactNode;
    /** Content to show when feature is enabled */
    children: React.ReactNode;
}

const FEATURE_FLAGS: Record<string, boolean> = {
    // AI Features
    'ai_interview': true,
    'ai_resume_analysis': true,
    'ai_question_generator': true,

    // Advanced Features
    'proctoring': true,
    'video_interviews': true,
    'analytics_dashboard': true,

    // Beta Features
    'voice_feedback': process.env.NODE_ENV === 'development',
    'real_time_hints': false,
};

export function FeatureFlagGuard({ flag, fallback = null, children }: FeatureFlagGuardProps) {
    const isEnabled = FEATURE_FLAGS[flag] ?? false;

    return <>{isEnabled ? children : fallback}</>;
}

/**
 * Higher-order component for protecting entire pages
 */
export function withPermission<P extends object>(
    Component: React.ComponentType<P>,
    permission: Permission,
    fallback?: React.ReactNode
) {
    return function ProtectedComponent(props: P) {
        return (
            <PermissionGuard permission={permission} fallback={fallback}>
                <Component {...props} />
            </PermissionGuard>
        );
    };
}

/**
 * Hook for imperative permission checking
 */
export function usePermissions() {
    const { hasPermission, hasAnyPermission, hasAllPermissions, canAccessRoute, canCallApi } = useAuth();

    return {
        hasPermission,
        hasAnyPermission,
        hasAllPermissions,
        canAccessRoute,
        canCallApi,
    };
}
