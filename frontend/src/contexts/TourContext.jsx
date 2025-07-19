import React, { createContext, useContext, useState, useCallback } from 'react'

const TourContext = createContext()

export const useTour = () => {
  const context = useContext(TourContext)
  if (!context) {
    throw new Error('useTour must be used within a TourProvider')
  }
  return context
}

export const TourProvider = ({ children }) => {
  const [isActive, setIsActive] = useState(false)
  const [currentStep, setCurrentStep] = useState(0)
  const [tourSteps, setTourSteps] = useState([])
  const [completedTours, setCompletedTours] = useState(() => {
    const saved = localStorage.getItem('maes-completed-tours')
    return saved ? JSON.parse(saved) : []
  })

  const startTour = useCallback((steps, tourId) => {
    if (completedTours.includes(tourId)) return
    
    setTourSteps(steps)
    setCurrentStep(0)
    setIsActive(true)
  }, [completedTours])

  const nextStep = useCallback(() => {
    setCurrentStep(prev => {
      if (prev < tourSteps.length - 1) {
        return prev + 1
      }
      return prev
    })
  }, [tourSteps.length])

  const prevStep = useCallback(() => {
    setCurrentStep(prev => Math.max(0, prev - 1))
  }, [])

  const endTour = useCallback((tourId) => {
    setIsActive(false)
    setCurrentStep(0)
    setTourSteps([])
    
    if (tourId && !completedTours.includes(tourId)) {
      const updated = [...completedTours, tourId]
      setCompletedTours(updated)
      localStorage.setItem('maes-completed-tours', JSON.stringify(updated))
    }
  }, [completedTours])

  const skipTour = useCallback((tourId) => {
    endTour(tourId)
  }, [endTour])

  const resetTour = useCallback((tourId) => {
    const updated = completedTours.filter(id => id !== tourId)
    setCompletedTours(updated)
    localStorage.setItem('maes-completed-tours', JSON.stringify(updated))
  }, [completedTours])

  const isTourCompleted = useCallback((tourId) => {
    return completedTours.includes(tourId)
  }, [completedTours])

  const value = {
    isActive,
    currentStep,
    tourSteps,
    startTour,
    nextStep,
    prevStep,
    endTour,
    skipTour,
    resetTour,
    isTourCompleted,
    hasNextStep: currentStep < tourSteps.length - 1,
    hasPrevStep: currentStep > 0,
    isLastStep: currentStep === tourSteps.length - 1
  }

  return (
    <TourContext.Provider value={value}>
      {children}
    </TourContext.Provider>
  )
}