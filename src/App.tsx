import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from '@/lib/auth'
import { CartProvider } from '@/lib/cart'
import { lazy, Suspense, type ReactNode } from 'react'
import { Loader2, Settings2 } from 'lucide-react'
import { isSupabaseConfigured, missingConfigKeys } from '@/lib/supabase'

const StoreLayout = lazy(() => import('@/layouts/StoreLayout'))
const HomePage = lazy(() => import('@/pages/store/HomePage'))
const ProductsPage = lazy(() => import('@/pages/store/ProductsPage'))
const ProductDetailPage = lazy(() => import('@/pages/store/ProductDetailPage'))
const CartPage = lazy(() => import('@/pages/store/CartPage'))
const CheckoutPage = lazy(() => import('@/pages/store/CheckoutPage'))
const OrderConfirmationPage = lazy(() => import('@/pages/store/OrderConfirmationPage'))
const TrackOrderPage = lazy(() => import('@/pages/store/TrackOrderPage'))
const CustomRequestPage = lazy(() => import('@/pages/store/CustomRequestPage'))
const CustomRequestStatusPage = lazy(() => import('@/pages/store/CustomRequestStatusPage'))
const InfoPage = lazy(() => import('@/pages/store/InfoPage'))
const AdminLogin = lazy(() => import('@/pages/admin/AdminLogin'))
const AdminLayout = lazy(() => import('@/layouts/AdminLayout'))
const AdminDashboard = lazy(() => import('@/pages/admin/Dashboard'))
const AdminProducts = lazy(() => import('@/pages/admin/Products'))
const AdminProductEdit = lazy(() => import('@/pages/admin/ProductEdit'))
const AdminCategories = lazy(() => import('@/pages/admin/Categories'))
const AdminOrders = lazy(() => import('@/pages/admin/Orders'))
const AdminDelivery = lazy(() => import('@/pages/admin/Delivery'))
const AdminRequests = lazy(() => import('@/pages/admin/Requests'))
const AdminManufacturingPricing = lazy(() => import('@/pages/admin/ManufacturingPricing'))
const AdminSettings = lazy(() => import('@/pages/admin/Settings'))
const AdminHistory = lazy(() => import('@/pages/admin/History'))

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

function ConfigurationNotice() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-charcoal-950 px-4">
      <div className="w-full max-w-lg rounded-xl border border-charcoal-400/15 bg-charcoal-800 p-8">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-red">
          <Settings2 className="h-6 w-6 text-white" />
        </div>
        <h1 className="text-xl font-bold text-offwhite">Configuration requise</h1>
        <p className="mt-3 text-sm leading-relaxed text-charcoal-300">
          La boutique n'est pas encore connectée à sa base de données. Renseignez les variables
          d'environnement suivantes, puis redémarrez l'application.
        </p>
        <ul className="mt-4 space-y-1.5">
          {missingConfigKeys.map((key) => (
            <li
              key={key}
              className="rounded-lg border border-charcoal-400/15 bg-charcoal-900 px-3 py-2 font-mono text-xs text-brand-red-light"
            >
              {key}
            </li>
          ))}
        </ul>
        <p className="mt-4 text-xs text-charcoal-400">
          Copiez <span className="font-mono">.env.example</span> vers{' '}
          <span className="font-mono">.env</span> et utilisez les valeurs publiques du projet
          Supabase. N'y placez jamais de clé <span className="font-mono">service_role</span>.
        </p>
      </div>
    </div>
  )
}

export default function App() {
  if (!isSupabaseConfigured) return <ConfigurationNotice />

  return (
    <AuthProvider>
      <CartProvider>
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
                <Route path="commandes" element={<AdminOrders />} />
                <Route path="livraison" element={<AdminDelivery />} />
                <Route path="demandes" element={<AdminRequests />} />
                <Route path="tarification" element={<AdminManufacturingPricing />} />
                <Route path="parametres" element={<AdminSettings />} />
                <Route path="historique" element={<AdminHistory />} />
              </Route>
              <Route path="/boutique" element={<StoreLayout />}>
                <Route index element={<HomePage />} />
                <Route path="produits" element={<ProductsPage />} />
                <Route path="produits/:slug" element={<ProductDetailPage />} />
                <Route path="panier" element={<CartPage />} />
                <Route path="commande" element={<CheckoutPage />} />
                <Route path="commande/confirmation" element={<OrderConfirmationPage />} />
                <Route path="suivi" element={<TrackOrderPage />} />
                <Route path="sur-mesure" element={<CustomRequestPage />} />
                <Route path="sur-mesure/suivi" element={<CustomRequestStatusPage />} />
                <Route path="informations" element={<InfoPage />} />
              </Route>
              <Route path="/" element={<Navigate to="/boutique" replace />} />
              <Route path="*" element={<Navigate to="/boutique" replace />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </CartProvider>
    </AuthProvider>
  )
}
