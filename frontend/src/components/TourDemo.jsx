import React from 'react'
import {
  Box,
  Typography,
  Paper,
  Button,
  Grid,
  Card,
  CardContent,
  Chip,
  Alert,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Divider
} from '@mui/material'
import {
  Tour as TourIcon,
  PlayArrow,
  Settings,
  Dashboard,
  CloudDownload,
  CheckCircle
} from '@mui/icons-material'
import TourButton from './TourButton'
import { useTour } from '../contexts/TourContext'

const TourDemo = () => {
  const { resetTour } = useTour()

  const demoTourSteps = [
    {
      target: '[data-tour="demo-title"]',
      title: 'Welcome to the Tour System!',
      content: 'This is a demonstration of the MAES platform guided tour system. Tours help new users learn how to use different features.',
      tourId: 'demo-tour'
    },
    {
      target: '[data-tour="demo-features"]',
      title: 'Tour Features',
      content: 'Tours include automatic highlighting, step-by-step guidance, progress tracking, and the ability to skip or restart at any time.',
      tourId: 'demo-tour'
    },
    {
      target: '[data-tour="demo-controls"]',
      title: 'Tour Controls',
      content: 'Use these buttons to start tours, reset completed tours, or test the tour system functionality.',
      tourId: 'demo-tour'
    }
  ]

  return (
    <Box sx={{ p: 3 }}>
      <Paper sx={{ p: 4 }}>
        <Box sx={{ textAlign: 'center', mb: 4 }}>
          <Typography variant="h4" gutterBottom data-tour="demo-title">
            🚀 MAES Guided Tour System
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
            Interactive tours to help users discover and learn platform features
          </Typography>
        </Box>

        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <Card data-tour="demo-features">
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  <TourIcon color="primary" sx={{ mr: 1, verticalAlign: 'middle' }} />
                  Tour Features
                </Typography>
                <List>
                  <ListItem>
                    <ListItemIcon><CheckCircle color="success" /></ListItemIcon>
                    <ListItemText 
                      primary="Auto-start for new users" 
                      secondary="Tours automatically start when users visit a page for the first time"
                    />
                  </ListItem>
                  <ListItem>
                    <ListItemIcon><CheckCircle color="success" /></ListItemIcon>
                    <ListItemText 
                      primary="Element highlighting" 
                      secondary="Important UI elements are highlighted with animated borders"
                    />
                  </ListItem>
                  <ListItem>
                    <ListItemIcon><CheckCircle color="success" /></ListItemIcon>
                    <ListItemText 
                      primary="Progress tracking" 
                      secondary="Users can see their progress through multi-step tours"
                    />
                  </ListItem>
                  <ListItem>
                    <ListItemIcon><CheckCircle color="success" /></ListItemIcon>
                    <ListItemText 
                      primary="Persistent state" 
                      secondary="Completed tours are remembered using localStorage"
                    />
                  </ListItem>
                </List>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={6}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Available Tours
                </Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <Alert severity="info" icon={<Dashboard />}>
                    <Typography variant="body2">
                      <strong>Dashboard Tour:</strong> Learn about system monitoring, metrics, and customization options
                    </Typography>
                  </Alert>
                  <Alert severity="info" icon={<CloudDownload />}>
                    <Typography variant="body2">
                      <strong>Extractions Tour:</strong> Discover how to create and manage data extraction jobs
                    </Typography>
                  </Alert>
                  <Alert severity="success" icon={<TourIcon />}>
                    <Typography variant="body2">
                      <strong>Demo Tour:</strong> Experience the tour system with this demonstration
                    </Typography>
                  </Alert>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        <Divider sx={{ my: 4 }} />

        <Box data-tour="demo-controls">
          <Typography variant="h6" gutterBottom>
            Tour Controls
          </Typography>
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
            <TourButton 
              tourSteps={demoTourSteps}
              tourId="demo-tour"
              variant="contained"
              startIcon={<PlayArrow />}
            >
              Start Demo Tour
            </TourButton>
            
            <Button
              variant="outlined"
              onClick={() => resetTour('dashboard-tour')}
              startIcon={<Settings />}
            >
              Reset Dashboard Tour
            </Button>
            
            <Button
              variant="outlined"
              onClick={() => resetTour('extractions-tour')}
              startIcon={<Settings />}
            >
              Reset Extractions Tour
            </Button>

            <Chip label="Tours auto-start for new users" color="primary" variant="outlined" />
          </Box>
        </Box>

        <Alert severity="info" sx={{ mt: 3 }}>
          <Typography variant="body2">
            <strong>For Developers:</strong> Tours are defined using CSS selectors (data-tour attributes) and can be easily 
            added to any page. The tour system automatically handles positioning, navigation, and state management.
          </Typography>
        </Alert>
      </Paper>
    </Box>
  )
}

export default TourDemo