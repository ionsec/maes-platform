import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from '../utils/axios';

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

  const fetchOrganizations = async () => {
    try {
      const response = await axios.get('/api/user/organizations');
      const orgs = response.data.organizations || [];
      setOrganizations(orgs);
      
      // Select the primary organization or the first one
      if (orgs.length > 0) {
        const primaryOrg = orgs.find(org => org.is_primary) || orgs[0];
        setSelectedOrganization(primaryOrg);
      }
    } catch (error) {
      console.error('Failed to fetch organizations:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrganizations();
  }, []);

  const selectOrganization = (orgId) => {
    const org = organizations.find(o => o.organization_id === orgId);
    if (org) {
      setSelectedOrganization(org);
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
      }
    }
  }, [organizations]);

  const value = {
    organizations,
    selectedOrganization,
    selectedOrganizationId: selectedOrganization?.organization_id,
    loading,
    selectOrganization,
    refreshOrganizations: fetchOrganizations
  };

  return (
    <OrganizationContext.Provider value={value}>
      {children}
    </OrganizationContext.Provider>
  );
};