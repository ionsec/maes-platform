import React, { useEffect, useState, useRef } from 'react'
import {
  Box,
  Paper,
  Typography,
  Button,
  IconButton,
  Fade,
  Portal,
  Chip
} from '@mui/material'
import {
  Close,
  ArrowForward,
  ArrowBack,
  Help,
  SkipNext,
  Refresh
} from '@mui/icons-material'
import { useTour } from '../contexts/TourContext'

const TourOverlay = () => {
  const { isActive, currentStep, tourSteps, nextStep, prevStep, endTour, skipTour, hasNextStep, hasPrevStep, isLastStep } = useTour()
  const [targetElement, setTargetElement] = useState(null)
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 })
  const tooltipRef = useRef(null)

  const currentStepData = tourSteps[currentStep]

  useEffect(() => {
    if (!isActive || !currentStepData) return

    const findTarget = () => {
      const element = document.querySelector(currentStepData.target)
      if (element) {
        setTargetElement(element)
        element.scrollIntoView({ behavior: 'smooth', block: 'center' })
        
        // Calculate tooltip position
        const rect = element.getBoundingClientRect()
        const tooltipRect = tooltipRef.current?.getBoundingClientRect()
        
        let top = rect.bottom + 10
        let left = rect.left
        
        // Adjust position if tooltip would go off screen
        if (tooltipRect) {
          if (left + tooltipRect.width > window.innerWidth) {
            left = window.innerWidth - tooltipRect.width - 20
          }
          if (top + tooltipRect.height > window.innerHeight) {
            top = rect.top - tooltipRect.height - 10
          }
        }
        
        setTooltipPosition({ top, left })
      }
    }

    // Wait for DOM to be ready
    const timer = setTimeout(findTarget, 100)
    return () => clearTimeout(timer)
  }, [isActive, currentStep, currentStepData])

  if (!isActive || !currentStepData) return null

  return (
    <Portal>
      {/* Backdrop */}
      <Box
        sx={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          zIndex: 9998,
          pointerEvents: 'auto'
        }}
        onClick={() => skipTour(currentStepData.tourId)}
      />
      
      {/* Highlight box for target element */}
      {targetElement && (
        <Box
          sx={{
            position: 'fixed',
            top: targetElement.getBoundingClientRect().top - 4,
            left: targetElement.getBoundingClientRect().left - 4,
            width: targetElement.getBoundingClientRect().width + 8,
            height: targetElement.getBoundingClientRect().height + 8,
            border: '2px solid #1976d2',
            borderRadius: 1,
            zIndex: 9999,
            pointerEvents: 'none',
            boxShadow: '0 0 0 4px rgba(25, 118, 210, 0.3)'
          }}
        />
      )}

      {/* Tooltip */}
      <Fade in={true}>
        <Paper
          ref={tooltipRef}
          sx={{
            position: 'fixed',
            top: tooltipPosition.top,
            left: tooltipPosition.left,
            maxWidth: 320,
            zIndex: 10000,
            p: 3,
            boxShadow: 6,
            borderRadius: 2,
            border: '1px solid',
            borderColor: 'divider'
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <Box sx={{ display: 'flex', alignItems: 'flex-start', mb: 2 }}>
            <Help color="primary" sx={{ mr: 1, mt: 0.5 }} />
            <Box sx={{ flex: 1 }}>
              <Typography variant="h6" gutterBottom>
                {currentStepData.title}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {currentStepData.content}
              </Typography>
            </Box>
            <IconButton
              size="small"
              onClick={() => skipTour(currentStepData.tourId)}
              sx={{ ml: 1 }}
            >
              <Close fontSize="small" />
            </IconButton>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Chip 
                label={`${currentStep + 1} of ${tourSteps.length}`} 
                size="small" 
                variant="outlined" 
              />
              <Button
                size="small"
                onClick={() => skipTour(currentStepData.tourId)}
                startIcon={<SkipNext />}
                variant="text"
                color="secondary"
                sx={{ fontSize: '0.75rem' }}
              >
                Skip Tour
              </Button>
            </Box>
            
            <Box sx={{ display: 'flex', gap: 1 }}>
              {hasPrevStep && (
                <Button
                  size="small"
                  onClick={prevStep}
                  startIcon={<ArrowBack />}
                  variant="outlined"
                >
                  Back
                </Button>
              )}
              
              {hasNextStep ? (
                <Button
                  size="small"
                  onClick={nextStep}
                  endIcon={<ArrowForward />}
                  variant="contained"
                >
                  Next
                </Button>
              ) : (
                <Button
                  size="small"
                  onClick={() => endTour(currentStepData.tourId)}
                  variant="contained"
                  color="success"
                >
                  Finish
                </Button>
              )}
            </Box>
          </Box>
        </Paper>
      </Fade>
    </Portal>
  )
}

export default TourOverlay