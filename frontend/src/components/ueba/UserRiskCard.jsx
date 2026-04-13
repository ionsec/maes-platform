import React, { useState, useEffect } from 'react';
import { Card, CardContent, Typography, Box, LinearProgress, Chip, Tooltip, IconButton } from '@mui/material';
import { Security, Warning, Info } from '@mui/icons-material';
import axios from '../../utils/axios';

const UserRiskCard = ({ userId, username, email, compact = false }) => {
  const [riskData, setRiskData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRisk = async () => {
      try {
        const response = await axios.get(`/ueba/risk/${userId}`);
        setRiskData(response.data.riskScore);
      } catch (error) {
        console.error('Failed to fetch risk data:', error);
      } finally {
        setLoading(false);
      }
    };

    if (userId) {
      fetchRisk();
    }
  }, [userId]);

  if (loading) {
    return <LinearProgress />;
  }

  const getRiskColor = (score) => {
    if (score >= 70) return 'error';
    if (score >= 40) return 'warning';
    if (score >= 20) return 'info';
    return 'success';
  };

  const getRiskLabel = (score) => {
    if (score >= 70) return 'Critical';
    if (score >= 40) return 'High';
    if (score >= 20) return 'Elevated';
    if (score > 0) return 'Low';
    return 'Normal';
  };

  const riskScore = riskData?.risk_score || 0;
  const confidence = riskData?.confidence || 0;

  if (compact) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Chip
          label={getRiskLabel(riskScore)}
          color={getRiskColor(riskScore)}
          size="small"
          variant="outlined"
        />
        <Typography variant="body2" color="text.secondary">
          {riskScore}/100
        </Typography>
      </Box>
    );
  }

  return (
    <Card variant="outlined">
      <CardContent>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
          <Box>
            <Typography variant="subtitle2" fontWeight="medium">
              {username || 'User'}
            </Typography>
            {email && (
              <Typography variant="caption" color="text.secondary">
                {email}
              </Typography>
            )}
          </Box>
          <Tooltip title="Risk confidence level">
            <Chip
              label={`${confidence}% confidence`}
              size="small"
              color={confidence >= 70 ? 'success' : confidence >= 50 ? 'warning' : 'default'}
              variant="outlined"
            />
          </Tooltip>
        </Box>

        <Box sx={{ mb: 1 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
            <Typography variant="body2" color="text.secondary">
              Risk Score
            </Typography>
            <Typography variant="body2" fontWeight="bold">
              {riskScore}/100
            </Typography>
          </Box>
          <LinearProgress
            variant="determinate"
            value={riskScore}
            color={getRiskColor(riskScore)}
            sx={{ height: 8, borderRadius: 1 }}
          />
        </Box>

        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Chip
            label={getRiskLabel(riskScore)}
            color={getRiskColor(riskScore)}
            size="small"
            icon={riskScore >= 40 ? <Warning /> : <Security />}
          />
          
          {riskData?.primary_country && (
            <Typography variant="caption" color="text.secondary">
              {riskData.primary_country}
            </Typography>
          )}
        </Box>

        {riskScore >= 40 && (
          <Box sx={{ mt: 2, p: 1, bgcolor: 'warning.light', borderRadius: 1 }}>
            <Typography variant="caption" fontWeight="medium">
              ⚠ Elevated risk detected
            </Typography>
            {riskData?.unique_countries > 3 && (
              <Typography variant="caption" display="block">
                • Multiple countries: {riskData.unique_countries}
              </Typography>
            )}
            {riskData?.unique_ips > 10 && (
              <Typography variant="caption" display="block">
                • Multiple IPs: {riskData.unique_ips}
              </Typography>
            )}
          </Box>
        )}
      </CardContent>
    </Card>
  );
};

export default UserRiskCard;
