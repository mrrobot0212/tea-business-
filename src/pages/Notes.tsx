import React, { useEffect, useState, useCallback } from 'react'
import { Search, Plus, Pin, PinOff, Pencil, Trash2, BookOpen, X, Check } from 'lucide-react'
import toast from 'react-hot-toast'
import { formatDateTime, getInitials } from '../utils/formatters'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import type { Database } from '../lib/database.types'

type Note = Database['public']['Tables']['notes']['Row']
type Partner = Database['public']['Tables']['partners']['Row']

interface NoteWithAuthor extends Note {
  author: Pick<Partner, 'id' | 'name'> | null
}

interface NoteModalProps {
  note: NoteWithAuthor | null
  onClose: () => void
  onSaved: () => void
  currentPartnerId: string
}

// ─── Pastel colours for avatars (deterministic by name) ──────────────────────
const AVATAR_COLOURS = [
  'bg-green-100 text-green-700',
  'bg-blue-100 text-blue-700',
  'bg-purple-100 text-purple-700',
  'bg-orange-100 text-orange-700',
  'bg-pink-100 text-pink-700',
  'bg-teal-100 text-teal-700',
]
function avatarColour(name: string) {
  const idx = name.charCodeAt(0) % AVATAR_COLOURS.length
  return AVATAR_COLOURS[idx]
}

// ─── Add / Edit Modal ─────────────────────────────────────────────────────────
function NoteModal({ note, onClose, onSaved, currentPartnerId }: NoteModalProps) {
  const isEdit = note !== null
  const [title, setTitle] = useState(note?.title ?? '')
  const [content, setContent] = useState(note?.content ?? '')
  const [isPinned, setIsPinned] = useState(note?.is_pinned ?? false)
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) {
      toast.error('Title is required')
      return
    }
    setSaving(true)
    try {
      if (isEdit) {
        const { error } = await supabase
          .from('notes')
          .update({ title: title.trim(), content: content.trim(), is_pinned: isPinned, updated_at: new Date().toISOString() })
          .eq('id', note.id)
        if (error) throw error
        toast.success('Note updated')
      } else {
        const { error } = await supabase.from('notes').insert({
          title: title.trim(),
          content: content.trim(),
          is_pinned: isPinned,
          created_by: currentPartnerId,
        })
        if (error) throw error
        toast.success('Note created')
      }
      onSaved()
      onClose()
    } catch (err: unknown) {
      toast.error((err as Error).message ?? 'Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-800">
            {isEdit ? 'Edit Note' : 'New Note'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 px-6 py-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Title <span className="text-red-500">*</span>
            </label>
            <input
              className="input-field"
              placeholder="Note title…"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Content</label>
            <textarea
              className="input-field resize-none"
              rows={8}
              placeholder="Write your note here…"
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
          </div>

          {/* Pin toggle */}
          <label className="flex items-center gap-3 cursor-pointer select-none w-fit">
            <div
              onClick={() => setIsPinned((p) => !p)}
              className={`w-10 h-5 rounded-full transition-colors flex items-center px-0.5 ${
                isPinned ? 'bg-yellow-400' : 'bg-gray-200'
              }`}
            >
              <div
                className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${
                  isPinned ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </div>
            <span className="text-sm text-gray-700 flex items-center gap-1">
              <Pin className="h-3.5 w-3.5" /> Pin this note
            </span>
          </label>

          {/* Footer */}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="btn-primary flex items-center gap-2">
              {saving ? (
                <span className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              {isEdit ? 'Save Changes' : 'Create Note'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Delete Confirmation ──────────────────────────────────────────────────────
interface DeleteDialogProps {
  note: NoteWithAuthor
  onClose: () => void
  onDeleted: () => void
}
function DeleteDialog({ note, onClose, onDeleted }: DeleteDialogProps) {
  const [deleting, setDeleting] = useState(false)

  async function handleDelete() {
    setDeleting(true)
    const { error } = await supabase.from('notes').delete().eq('id', note.id)
    setDeleting(false)
    if (error) {
      toast.error(error.message)
      return
    }
    toast.success('Note deleted')
    onDeleted()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6 flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <div className="bg-red-100 p-2 rounded-full">
            <Trash2 className="h-5 w-5 text-red-600" />
          </div>
          <h3 className="text-base font-semibold text-gray-800">Delete Note</h3>
        </div>
        <p className="text-sm text-gray-600">
          Are you sure you want to delete{' '}
          <span className="font-medium">"{note.title}"</span>? This action cannot be undone.
        </p>
        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="bg-red-600 hover:bg-red-700 text-white text-sm font-medium px-4 py-2 rounded-lg flex items-center gap-2 disabled:opacity-60"
          >
            {deleting && (
              <span className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
            )}
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Note Card ────────────────────────────────────────────────────────────────
interface NoteCardProps {
  note: NoteWithAuthor
  onEdit: () => void
  onDelete: () => void
  onTogglePin: () => void
}
function NoteCard({ note, onEdit, onDelete, onTogglePin }: NoteCardProps) {
  const authorName = note.author?.name ?? 'Unknown'
  const colour = avatarColour(authorName)

  return (
    <div
      className={`relative bg-white rounded-xl shadow-sm border-2 transition-shadow hover:shadow-md group flex flex-col gap-3 p-4 ${
        note.is_pinned ? 'border-yellow-400' : 'border-transparent'
      }`}
    >
      {/* Pin badge */}
      {note.is_pinned && (
        <span className="absolute top-3 right-3 text-yellow-500">
          <Pin className="h-4 w-4 fill-yellow-400" />
        </span>
      )}

      {/* Title */}
      <h3 className="text-sm font-semibold text-gray-800 pr-5 line-clamp-1">{note.title}</h3>

      {/* Content preview */}
      <p className="text-xs text-gray-500 leading-relaxed line-clamp-3 flex-1 whitespace-pre-wrap">
        {note.content || <span className="italic">No content</span>}
      </p>

      {/* Footer */}
      <div className="flex items-center justify-between pt-1">
        <div className="flex items-center gap-2">
          <div
            className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${colour}`}
          >
            {getInitials(authorName)}
          </div>
          <span className="text-xs text-gray-500 truncate max-w-[100px]">{authorName}</span>
        </div>
        <span className="text-[11px] text-gray-400">{formatDateTime(note.updated_at)}</span>
      </div>

      {/* Hover actions */}
      <div className="absolute inset-0 rounded-xl bg-white/80 backdrop-blur-[1px] opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
        <button
          onClick={onTogglePin}
          title={note.is_pinned ? 'Unpin' : 'Pin'}
          className="p-2 rounded-lg bg-yellow-50 hover:bg-yellow-100 text-yellow-600 transition-colors"
        >
          {note.is_pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
        </button>
        <button
          onClick={onEdit}
          title="Edit"
          className="p-2 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-600 transition-colors"
        >
          <Pencil className="h-4 w-4" />
        </button>
        <button
          onClick={onDelete}
          title="Delete"
          className="p-2 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 transition-colors"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function Notes() {
  const { partner } = useAuth()
  const [notes, setNotes] = useState<NoteWithAuthor[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editNote, setEditNote] = useState<NoteWithAuthor | null>(null)
  const [deleteNote, setDeleteNote] = useState<NoteWithAuthor | null>(null)

  const fetchNotes = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('notes')
      .select('*, author:partners!notes_created_by_fkey(id, name)')
      .order('is_pinned', { ascending: false })
      .order('updated_at', { ascending: false })

    if (error) {
      toast.error('Failed to load notes')
    } else {
      setNotes((data ?? []) as unknown as NoteWithAuthor[])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchNotes()
  }, [fetchNotes])

  async function handleTogglePin(note: NoteWithAuthor) {
    const { error } = await supabase
      .from('notes')
      .update({ is_pinned: !note.is_pinned, updated_at: new Date().toISOString() })
      .eq('id', note.id)
    if (error) {
      toast.error(error.message)
      return
    }
    toast.success(note.is_pinned ? 'Note unpinned' : 'Note pinned')
    fetchNotes()
  }

  // Filter by search query
  const filtered = notes.filter((n) => {
    const q = search.toLowerCase()
    return (
      n.title.toLowerCase().includes(q) ||
      n.content.toLowerCase().includes(q)
    )
  })

  const pinned = filtered.filter((n) => n.is_pinned)
  const unpinned = filtered.filter((n) => !n.is_pinned)

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <BookOpen className="h-6 w-6 text-primary-700" />
            Digital Notebook
          </h1>
          <p className="page-subtitle">Shared notes for the entire partnership</p>
        </div>
        <button
          onClick={() => { setEditNote(null); setModalOpen(true) }}
          className="btn-primary flex items-center gap-2 self-start sm:self-auto"
        >
          <Plus className="h-4 w-4" />
          New Note
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input
          className="input-field pl-9"
          placeholder="Search notes by title or content…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex justify-center py-20">
          <span className="animate-spin rounded-full h-8 w-8 border-4 border-primary-700 border-t-transparent" />
        </div>
      )}

      {/* Empty */}
      {!loading && filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 text-gray-400 gap-3">
          <BookOpen className="h-12 w-12 text-gray-200" />
          <p className="text-sm">
            {search ? 'No notes match your search.' : 'No notes yet. Create the first one!'}
          </p>
        </div>
      )}

      {/* Pinned section */}
      {!loading && pinned.length > 0 && (
        <section className="mb-6">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-yellow-600 mb-3 flex items-center gap-1.5">
            <Pin className="h-3.5 w-3.5 fill-yellow-400" />
            Pinned
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {pinned.map((note) => (
              <NoteCard
                key={note.id}
                note={note}
                onEdit={() => { setEditNote(note); setModalOpen(true) }}
                onDelete={() => setDeleteNote(note)}
                onTogglePin={() => handleTogglePin(note)}
              />
            ))}
          </div>
        </section>
      )}

      {/* All notes section */}
      {!loading && unpinned.length > 0 && (
        <section>
          {pinned.length > 0 && (
            <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">
              Other Notes
            </h2>
          )}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {unpinned.map((note) => (
              <NoteCard
                key={note.id}
                note={note}
                onEdit={() => { setEditNote(note); setModalOpen(true) }}
                onDelete={() => setDeleteNote(note)}
                onTogglePin={() => handleTogglePin(note)}
              />
            ))}
          </div>
        </section>
      )}

      {/* Add / Edit Modal */}
      {modalOpen && partner && (
        <NoteModal
          note={editNote}
          onClose={() => setModalOpen(false)}
          onSaved={fetchNotes}
          currentPartnerId={partner.id}
        />
      )}

      {/* Delete Dialog */}
      {deleteNote && (
        <DeleteDialog
          note={deleteNote}
          onClose={() => setDeleteNote(null)}
          onDeleted={fetchNotes}
        />
      )}
    </div>
  )
}
