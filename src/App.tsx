import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from '@/lib/auth'
import { lazy, Suspense, type ReactNode } from 'react'
import { Loader2 } from 'lucide-react'

const StoreLayout = lazy(() => import('@/layouts/StoreLayout'))
const HomePage = lazy(() => import('@/pages/store/HomePage'))
const ProductsPage = lazy(() => import('@/pages/store/ProductsPage'))
const ProductDetailPage = lazy(() => import('@/pages/store/ProductDetailPage'))
const AdminLogin = lazy(() => import('@/pages/admin/AdminLogin'))
const AdminLayout = lazy(() => import('@/layouts/AdminLayout'))
const AdminDashboard = lazy(() => import('@/pages/admin/Dashboard'))
const AdminProducts = lazy(() => import('@/pages/admin/Products'))
const AdminProductEdit = lazy(() => import('@/pages/admin/ProductEdit'))
const AdminCategories = lazy(() => import('@/pages/admin/Categories'))

function FullPageLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-charcoal-900">
      <Loader2 className="h-8 w-8 animate-spin text-brand-red" />
    </div>
  )
}

function RequireOwner({ children }: { children: ReactNode }) {
  const { isOwner, loading } = useAuth()
  if (loading) return <FullPageLoader />
  if (!isOwner) return <Navigate to="/admin" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Suspense fallback={<FullPageLoader />}>
          <Routes>
            <Route path="/admin" element={<AdminLogin />} />
            <Route
              path="/admin/*"
              element={
                <RequireOwner>
                  <AdminLayout />
                </RequireOwner>
              }
            >
              <Route path="dashboard" element={<AdminDashboard />} />
              <Route path="produits" element={<AdminProducts />} />
              <Route path="produits/nouveau" element={<AdminProductEdit />} />
              <Route path="produits/:id" element={<AdminProductEdit />} />
              <Route path="categories" element={<AdminCategories />} />
            </Route>
            <Route path="/boutique" element={<StoreLayout />}>
              <Route index element={<HomePage />} />
              <Route path="produits" element={<ProductsPage />} />
              <Route path="produits/:slug" element={<ProductDetailPage />} />
            </Route>
            <Route path="/" element={<Navigate to="/boutique" replace />} />
            <Route path="*" element={<Navigate to="/boutique" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
  )
}
