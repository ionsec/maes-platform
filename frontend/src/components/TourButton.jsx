import React from 'react'
import {
  Button,
  Tooltip
} from '@mui/material'
import {
  Help,
  TourOutlined
} from '@mui/icons-material'
import { useTour } from '../contexts/TourContext'

const TourButton = ({ 
  tourSteps, 
  tourId, 
  variant = 'outlined', 
  size = 'small',
  children,
  startIcon = <Help />,
  ...props 
}) => {
  const { startTour, isTourCompleted } = useTour()

  const handleStartTour = () => {
    startTour(tourSteps, tourId)
  }

  return (
    <Tooltip title={isTourCompleted(tourId) ? 'Retake tour' : 'Start guided tour'}>
      <Button
        variant={variant}
        size={size}
        onClick={handleStartTour}
        startIcon={startIcon}
        {...props}
      >
        {children || 'Take Tour'}
      </Button>
    </Tooltip>
  )
}

export default TourButton