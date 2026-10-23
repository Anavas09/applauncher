import { JSX, useEffect, useState } from 'react'

type LauncherApp = { id: string; name: string; cwd: string; command: string; port?: string }

const emptyForm = { name: '', cwd: '', command: 'npm run start', port: '' }

function App(): JSX.Element {
  const [apps, setApps] = useState<LauncherApp[]>([])
  const [form, setForm] = useState(emptyForm)
  const [logs, setLogs] = useState<Record<string, string>>({})
  const [selected, setSelected] = useState<string | null>(null)
  const [runningIds, setRunningIds] = useState<string[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)

  useEffect(() => {
    window.api.getRunning().then(setRunningIds)
    return window.api.onStatus(({ id, running }) => {
      setRunningIds((prev) =>
        running ? [...new Set([...prev, id])] : prev.filter((x) => x !== id)
      )
    })
  }, [])

  useEffect(() => {
    window.api.listApps().then(setApps)
  }, [])

  useEffect(() => {
    return window.api.onLog(({ id, data }) => {
      setLogs((prev) => ({ ...prev, [id]: ((prev[id] ?? '') + data).slice(-20000) }))
    })
  }, [])

  const persist = (next: LauncherApp[]): void => {
    setApps(next)
    window.api.saveApps(next)
  }

  const save = (): void => {
    if (!form.name || !form.cwd) return
    if (editingId) {
      persist(apps.map((a) => (a.id === editingId ? { ...a, ...form } : a)))
    } else {
      persist([...apps, { id: crypto.randomUUID(), ...form }])
    }
    cancelEdit()
  }

  const startEdit = (a: LauncherApp): void => {
    setEditingId(a.id)
    setForm({ name: a.name, cwd: a.cwd, command: a.command, port: a.port ?? '' })
  }

  const cancelEdit = (): void => {
    setEditingId(null)
    setForm(emptyForm)
  }

  const pickFolder = async (): Promise<void> => {
    const folder = await window.api.pickFolder()
    if (folder) setForm((f) => ({ ...f, cwd: folder }))
  }

  const remove = (id: string): void => persist(apps.filter((a) => a.id !== id))

  return (
    <div style={{ padding: 20 }}>
      <h3>Mis apps</h3>
      {apps.map((a) => (
        <div key={a.id} style={{ marginBottom: 8 }}>
          <span>{runningIds.includes(a.id) ? '🟢' : '⚪'}</span> <strong>{a.name}</strong>{' '}
          <button onClick={() => window.api.startApp(a)} disabled={runningIds.includes(a.id)}>
            Start
          </button>
          <button onClick={() => window.api.stopApp(a.id)} disabled={!runningIds.includes(a.id)}>
            Stop
          </button>
          <button onClick={() => startEdit(a)} disabled={runningIds.includes(a.id)}>
            Editar
          </button>
          {a.port && <button onClick={() => window.api.openApp(a.port!)}>Abrir</button>}
          <button
            onClick={() => {
              selected && selected === a.id ? setSelected(null) : setSelected(a.id)
            }}
          >
            Logs
          </button>
          <button onClick={() => remove(a.id)}>Eliminar</button>
        </div>
      ))}

      {selected && (
        <pre
          style={{ background: '#111', color: '#ddd', padding: 10, height: 200, overflow: 'auto' }}
        >
          {logs[selected] ?? 'Sin logs todavía'}
        </pre>
      )}

      <h3>{editingId ? 'Editar app' : 'Agregar app'}</h3>
      <input
        placeholder="Nombre"
        value={form.name}
        onChange={(e) => setForm({ ...form, name: e.target.value })}
      />
      <input
        placeholder="Carpeta (ruta completa)"
        value={form.cwd}
        onChange={(e) => setForm({ ...form, cwd: e.target.value })}
      />
      <button onClick={pickFolder}>Seleccionar carpeta</button>
      <input
        placeholder="Comando"
        value={form.command}
        onChange={(e) => setForm({ ...form, command: e.target.value })}
      />
      <input
        placeholder="Puerto (opcional)"
        value={form.port}
        onChange={(e) => setForm({ ...form, port: e.target.value })}
      />
      <button onClick={save}>{editingId ? 'Guardar' : 'Agregar'}</button>
      {editingId && <button onClick={cancelEdit}>Cancelar</button>}
    </div>
  )
}

export default App
