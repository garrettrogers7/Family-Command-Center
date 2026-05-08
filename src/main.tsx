import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from '@/contexts/AuthContext'
import { FamilyProvider } from '@/contexts/FamilyContext'
import { GoogleCalendarProvider } from '@/contexts/GoogleCalendarContext'
import App from '@/App'
import '@/index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <FamilyProvider>
          <GoogleCalendarProvider>
            <App />
          </GoogleCalendarProvider>
        </FamilyProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>
)
