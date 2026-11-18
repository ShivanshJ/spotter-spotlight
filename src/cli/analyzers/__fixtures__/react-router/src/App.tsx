import { createBrowserRouter } from 'react-router-dom'

const router = createBrowserRouter([
  { path: '/', element: <div>Home</div> },
  { path: '/settings', element: <div data-testid="settings-panel">Settings</div> },
  { path: '/billing', element: <div>Billing</div> },
])

export default router
