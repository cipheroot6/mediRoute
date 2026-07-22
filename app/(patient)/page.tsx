'use client'
import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import type { Profile } from '@/types'
import { createClient } from '@/lib/supabase/client'
import { MapPin, Accessibility, Navigation, Building2, ArrowLeft, QrCode } from 'lucide-react'

type Hospital = {
  id: string
  name: string
}

function EntryContent() {
  const [hospitals, setHospitals] = useState<Hospital[]>([])
  const [loadingHospitals, setLoadingHospitals] = useState(true)
  const [selectedHospital, setSelectedHospital] = useState<Hospital | null>(null)
  
  const [query, setQuery] = useState('')
  const [profile, setProfile] = useState<Profile>('standard')
  const [allNodes, setAllNodes] = useState<{id: string, label: string, hospital_id: string}[]>([])
  const [results, setResults] = useState<{id: string, label: string, hospital_id: string}[]>([])
  
  const router = useRouter()
  const searchParams = useSearchParams()
  const startNodeId = searchParams.get('startNodeId')
  const startX = searchParams.get('startX')
  const startY = searchParams.get('startY')
  const startFloor = searchParams.get('startFloor')
  const initialHospitalId = searchParams.get('hospitalId')
  
  const supabase = createClient()

  // 1. Fetch hospitals on mount
  useEffect(() => {
    async function loadHospitals() {
      try {
        const { data, error } = await supabase.from('hospitals').select('id, name')
        if (error) console.error('Error fetching hospitals:', error)
        if (data) setHospitals(data)
      } catch (err) {
        console.error('Fetch exception:', err)
      } finally {
        setLoadingHospitals(false)
      }
    }
    
    async function loadInitialHospital() {
      if (initialHospitalId && !selectedHospital) {
        const { data } = await supabase.from('hospitals').select('id, name').eq('id', initialHospitalId).single()
        if (data) setSelectedHospital(data)
      }
    }

    loadHospitals().then(() => {
      if (initialHospitalId) loadInitialHospital()
    })
  }, [supabase, initialHospitalId, selectedHospital])

  // 2. Fetch nodes when a hospital is selected
  useEffect(() => {
    if (!selectedHospital) return
    
    async function loadNodes() {
      const { data, error } = await supabase
        .from('nodes')
        .select('id, label, hospital_id')
        .eq('hospital_id', selectedHospital!.id)
        .eq('type', 'destination')
        
      console.log('Fetched nodes:', data, 'Error:', error)
      if (data) {
        setAllNodes(data)
        setResults(data.slice(0, 5))
      }
    }
    loadNodes()
  }, [supabase, selectedHospital])

  function handleSearch(q: string) {
    setQuery(q)
    if (!q) {
      setResults(allNodes.slice(0, 5))
      return
    }
    const lowerQ = q.toLowerCase()
    const filtered = allNodes.filter(n => n.label.toLowerCase().includes(lowerQ))
    setResults(filtered)
  }

  function handleSelect(nodeId: string) {
    sessionStorage.setItem('mediroute_dest', nodeId)
    sessionStorage.setItem('mediroute_profile', profile)
    
    if (startNodeId) {
      // We already have a start location, go straight to navigate
      const url = new URL('/navigate', window.location.origin)
      url.searchParams.set('hospitalId', selectedHospital!.id)
      url.searchParams.set('startNodeId', startNodeId)
      url.searchParams.set('startX', startX!)
      url.searchParams.set('startY', startY!)
      url.searchParams.set('startFloor', startFloor!)
      url.searchParams.set('dest', nodeId)
      url.searchParams.set('profile', profile)
      router.push(url.pathname + url.search)
    } else {
      router.push(`/scan?dest=${nodeId}&profile=${profile}`)
    }
  }

  return (
    <div className="min-h-screen bg-background flex flex-col px-6 pt-16">
      <div className="max-w-md w-full mx-auto">
        
        {!selectedHospital ? (
          // --- STEP 1: SELECT HOSPITAL ---
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h1 className="text-3xl font-bold tracking-tight mb-2">MediRoute</h1>
            <p className="text-muted-foreground mb-8">Select your current location.</p>
            
            <div className="flex flex-col gap-3">
              {loadingHospitals ? (
                <div className="text-center py-12 border border-dashed border-border rounded-2xl">
                  <p className="text-muted-foreground">Loading hospitals...</p>
                </div>
              ) : hospitals.length > 0 ? (
                hospitals.map(h => (
                  <button
                    key={h.id}
                    onClick={() => setSelectedHospital(h)}
                    className="text-left px-5 py-4 rounded-2xl border border-border bg-black/20 hover:bg-black/60 hover:border-primary/50 transition-all flex items-center gap-4 group"
                  >
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0">
                      <Building2 size={20} />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-lg group-hover:text-primary transition-colors">{h.name}</p>
                    </div>
                    <Navigation size={18} className="text-muted-foreground group-hover:text-primary transition-colors transform group-hover:translate-x-1" />
                  </button>
                ))
              ) : (
                <div className="text-center py-12 border border-dashed border-border rounded-2xl">
                  <p className="text-muted-foreground">No hospitals found.</p>
                </div>
              )}
            </div>
          </div>
        ) : (
          // --- STEP 2: SELECT DESTINATION ---
          <div className="animate-in fade-in slide-in-from-right-8 duration-500">
            <button 
              onClick={() => {
                setSelectedHospital(null)
                setQuery('')
                setResults([])
              }} 
              className="flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
            >
              <ArrowLeft size={16} className="mr-2" /> Back to hospitals
            </button>
            
            <h1 className="text-3xl font-bold tracking-tight mb-1">{selectedHospital.name}</h1>
            <p className="text-muted-foreground mb-8">Where do you need to go today?</p>

             <div className="flex flex-col gap-3 mb-8 bg-black/20 p-1.5 rounded-full border border-border">
               {(['standard', 'wheelchair'] as Profile[]).map(p => {
                 const isActive = profile === p
                 return (
                   <button
                     key={p}
                     onClick={() => setProfile(p)}
                     className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-full text-sm font-medium transition-all ${
                       isActive
                         ? 'bg-primary text-primary-foreground shadow-lg'
                         : 'text-muted-foreground hover:text-foreground'
                     }`}
                   >
                     {p === 'standard' ? <Navigation size={16} /> : <Accessibility size={16} />}
                     {p === 'standard' ? 'Standard' : 'Accessible'}
                   </button>
                 )
               })}
             </div>

             {/* Scan QR Button */}
             {!startNodeId && (
              <button
                onClick={() => router.push(`/scan?profile=${profile}`)}
                className="w-full mb-6 py-4 rounded-2xl border border-border bg-primary/10 text-primary hover:bg-primary/20 transition-all flex items-center justify-center gap-2 font-semibold"
              >
                <QrCode size={20} />
                Scan QR Code
              </button>
             )}
             {/* Search bar */}
             <div className="relative mb-6">
              <input
                type="search"
                placeholder="Search for departments, rooms..."
                value={query}
                onChange={e => handleSearch(e.target.value)}
                className="w-full border border-border bg-black/40 rounded-2xl pl-12 pr-4 py-4 text-base focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                autoFocus
              />
              <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" size={20} />
            </div>

            {/* Results */}
            <div className="flex flex-col gap-3 pb-12">
              {results.length > 0 ? (
                results.map(r => (
                  <button
                    key={r.id}
                    onClick={() => handleSelect(r.id)}
                    className="text-left px-5 py-4 rounded-2xl border border-border bg-black/20 hover:bg-black/60 hover:border-primary/50 transition-all flex items-center justify-between group"
                  >
                    <p className="font-medium text-lg">{r.label}</p>
                    <Navigation size={18} className="text-muted-foreground group-hover:text-primary transition-colors" />
                  </button>
                ))
              ) : (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">No destinations found.</p>
                </div>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  )
}

export default function EntryPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background flex items-center justify-center text-muted-foreground">Loading...</div>}>
      <EntryContent />
    </Suspense>
  )
}
