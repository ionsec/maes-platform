import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from '../utils/axios';
import { setCurrentOrganizationId } from '../stores/organizationStore';
import { useAuthStore } from '../stores/authStore';

const OrganizationContext = createContext();

export const useOrganization = () => {
  const context = useContext(OrganizationContext);
  if (!context) {
    throw new Error('useOrganization must be used within an OrganizationProvider');
  }
  return context;
};

export const OrganizationProvider = ({ children }) => {
  const [organizations, setOrganizations] = useState([]);
  const [selectedOrganization, setSelectedOrganization] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const token = useAuthStore((state) => state.token);

  const fetchOrganizations = async () => {
    // Don't fetch if not authenticated
    if (!isAuthenticated || !token) {
      console.log('Skipping organization fetch - not authenticated');
      setLoading(false);
      return;
    }

    setError(null);
    setLoading(true);
    
    try {
      const response = await axios.get('/api/user/organizations');
      const orgs = response.data.organizations || [];
      setOrganizations(orgs);
      
      // Select the primary organization or the first one
      if (orgs.length > 0) {
        const primaryOrg = orgs.find(org => org.is_primary) || orgs[0];
        setSelectedOrganization(primaryOrg);
        // Update the global store
        setCurrentOrganizationId(primaryOrg.organization_id);
      }
    } catch (error) {
      console.error('Failed to fetch organizations:', error);
      
      // Only set error for non-auth errors
      if (error.response?.status !== 401 && error.response?.status !== 403) {
        setError('Failed to load organizations');
      }
      
      // Clear organizations on auth error
      if (error.response?.status === 401 || error.response?.status === 403) {
        setOrganizations([]);
        setSelectedOrganization(null);
        setCurrentOrganizationId(null);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Only fetch organizations when authenticated
    if (isAuthenticated && token) {
      fetchOrganizations();
    } else {
      // Clear organizations when not authenticated
      setOrganizations([]);
      setSelectedOrganization(null);
      setCurrentOrganizationId(null);
      setLoading(false);
    }
  }, [isAuthenticated, token]);

  const selectOrganization = (orgId) => {
    const org = organizations.find(o => o.organization_id === orgId);
    if (org) {
      setSelectedOrganization(org);
      // Update the global store
      setCurrentOrganizationId(orgId);
      // Store in localStorage for persistence
      localStorage.setItem('selectedOrganizationId', orgId);
    }
  };

  // Load saved selection from localStorage
  useEffect(() => {
    const savedOrgId = localStorage.getItem('selectedOrganizationId');
    if (savedOrgId && organizations.length > 0) {
      const org = organizations.find(o => o.organization_id === savedOrgId);
      if (org) {
        setSelectedOrganization(org);
        // Update the global store
        setCurrentOrganizationId(savedOrgId);
      }
    }
  }, [organizations]);

  const value = {
    organizations,
    selectedOrganization,
    selectedOrganizationId: selectedOrganization?.organization_id,
    loading,
    error,
    selectOrganization,
    refreshOrganizations: fetchOrganizations,
    isAuthenticated
  };

  return (
    <OrganizationContext.Provider value={value}>
      {children}
    </OrganizationContext.Provider>
  );
};