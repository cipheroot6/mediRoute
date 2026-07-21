'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Building2, Plus, ArrowRight } from 'lucide-react'

type Hospital = {
  id: string
  name: string
  floors: number
}

export default function AdminDashboard() {
  const [hospitals, setHospitals] = useState<Hospital[]>([])
  const [loading, setLoading] = useState(true)
  const [id, setId] = useState('')
  const [name, setName] = useState('')
  const [floors, setFloors] = useState(1)
  const [submitting, setSubmitting] = useState(false)
  
  const router = useRouter()

  useEffect(() => {
    fetch('/api/admin/hospitals')
      .then(res => res.json())
      .then(data => {
        setHospitals(data)
        setLoading(false)
      })
      .catch(err => {
        console.error('Failed to load hospitals:', err)
        setLoading(false)
      })
  }, [])

  async function handleAddHospital(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    const res = await fetch('/api/admin/hospitals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, name, floors })
    })
    
    if (res.ok) {
      const newHospital = await res.json()
      setHospitals([...hospitals, newHospital])
      setId('')
      setName('')
      setFloors(1)
    }
    setSubmitting(false)
  }

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-4xl mx-auto space-y-12">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">Hospitals</h1>
          <p className="text-muted-foreground mt-2">Manage your hospital floor plans and navigation data.</p>
        </div>

        {loading ? (
          <div className="animate-pulse space-y-4">
            <div className="h-24 bg-muted rounded-xl"></div>
            <div className="h-24 bg-muted rounded-xl"></div>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {hospitals.map(h => (
              <Link 
                key={h.id} 
                href={`/admin/${h.id}/1`}
                className="group p-6 rounded-2xl border border-border bg-black/40 hover:bg-black/80 transition-all flex items-center justify-between"
              >
                <div className="flex items-center space-x-4">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                    <Building2 size={24} />
                  </div>
                  <div>
                    <h2 className="font-medium text-lg group-hover:text-primary transition-colors">{h.name}</h2>
                    <p className="text-sm text-muted-foreground">{h.floors} floor{h.floors !== 1 ? 's' : ''}</p>
                  </div>
                </div>
                <ArrowRight className="text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
              </Link>
            ))}
            
            {hospitals.length === 0 && (
              <div className="col-span-full py-12 text-center border border-dashed border-border rounded-2xl">
                <p className="text-muted-foreground">No hospitals created yet.</p>
              </div>
            )}
          </div>
        )}

        <div className="p-6 rounded-2xl border border-border bg-black/40">
          <h2 className="text-xl font-medium mb-4 flex items-center">
            <Plus className="mr-2" size={20} /> Add Hospital
          </h2>
          <form onSubmit={handleAddHospital} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-sm font-medium mb-1 block">ID (Slug)</label>
                <input
                  type="text"
                  placeholder="e.g. mercy-general"
                  value={id}
                  onChange={e => setId(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  required
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Name</label>
                <input
                  type="text"
                  placeholder="Mercy General Hospital"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  required
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Number of Floors</label>
                <input
                  type="number"
                  min="1"
                  value={floors}
                  onChange={e => setFloors(parseInt(e.target.value))}
                  className="flex h-10 w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  required
                />
              </div>
            </div>
            <button 
              type="submit" 
              disabled={submitting}
              className="bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2 rounded-md text-sm font-medium transition-colors"
            >
              {submitting ? 'Creating...' : 'Create Hospital'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
