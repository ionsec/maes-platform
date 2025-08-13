// Global store for organization context that can be accessed outside React components
let currentOrganizationId = null;

export const setCurrentOrganizationId = (orgId) => {
  currentOrganizationId = orgId;
  // Also store in localStorage for persistence
  if (orgId) {
    localStorage.setItem('currentOrganizationId', orgId);
  } else {
    localStorage.removeItem('currentOrganizationId');
  }
};

export const getCurrentOrganizationId = () => {
  // Try to get from memory first, then localStorage
  if (currentOrganizationId) {
    return currentOrganizationId;
  }
  
  const storedOrgId = localStorage.getItem('currentOrganizationId');
  if (storedOrgId) {
    currentOrganizationId = storedOrgId;
    return storedOrgId;
  }
  
  return null;
};

// Initialize from localStorage on module load
currentOrganizationId = localStorage.getItem('currentOrganizationId');