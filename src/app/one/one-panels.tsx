'use client';

import type { CSSProperties } from 'react';

export type RepoFile = { name: string; path: string; type: 'file' | 'dir'; sha?: string };

type PanelStyle = CSSProperties;

export function RepoManagerPanel({
  zones,
  activeZone,
  files,
  loading,
  editingFile,
  editContent,
  newFileName,
  newFileContent,
  newFileOpen,
  saving,
  message,
  panelStyle,
  mono,
  muted,
  buttonStyle,
  accentButtonStyle,
  onZoneChange,
  onOpenFile,
  onDeleteFile,
  onBack,
  onEditContentChange,
  onSave,
  onNewFileOpenChange,
  onNewFileNameChange,
  onNewFileContentChange,
  onCreateFile,
}: {
  zones: { key: string; label: string }[];
  activeZone: string;
  files: RepoFile[];
  loading: boolean;
  editingFile: { path: string } | null;
  editContent: string;
  newFileName: string;
  newFileContent: string;
  newFileOpen: boolean;
  saving: boolean;
  message: string;
  panelStyle: PanelStyle;
  mono: PanelStyle;
  muted: PanelStyle;
  buttonStyle: PanelStyle;
  accentButtonStyle: PanelStyle;
  onZoneChange: (zone: string) => void;
  onOpenFile: (file: RepoFile) => void;
  onDeleteFile: (file: RepoFile) => void;
  onBack: () => void;
  onEditContentChange: (value: string) => void;
  onSave: () => void;
  onNewFileOpenChange: (open: boolean) => void;
  onNewFileNameChange: (value: string) => void;
  onNewFileContentChange: (value: string) => void;
  onCreateFile: () => void;
}) {
  const inputStyle: PanelStyle = {
    ...mono,
    background: 'transparent',
    border: '1px solid var(--border)',
    color: 'var(--text)',
    padding: '0.35rem 0.6rem',
    outline: 'none',
    borderRadius: '0.4rem',
  };

  return (
    <section style={panelStyle}>
      <div style={{
        ...mono,
        color: 'var(--accent)',
        letterSpacing: '0.16em',
        textTransform: 'uppercase',
        marginBottom: '0.75rem',
        opacity: 0.85,
      }}>
        Repo Manager <span style={{ color: 'var(--muted)' }}· Manitec/plex</span>
      </div>

      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.9rem' }}>
        {zones.map(zone => (
          <button
            key={zone.key}
            onClick={() => onZoneChange(zone.key)}
            style={{
              ...mono,
              padding: '0.3rem 0.7rem',
              borderRadius: 999,
              background: activeZone === zone.key ? 'var(--accent)' : 'transparent',
              color: activeZone === zone.key ? 'var(--bg)' : 'var(--muted)',
              border: '1px solid var(--border)',
              cursor: 'pointer',
            }}
          >
            {zone.label}
          </button>
        ))}
      </div>

      {message && <p style={{ ...muted, color: 'var(--accent)', marginBottom: '0.6rem' }}>{message}</p>}

      {!editingFile ? (
        <>
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 0,
            marginBottom: '0.9rem',
            maxHeight: '14rem',
            overflowY: 'auto',
            border: '1px solid var(--border)',
            borderRadius: '0.5rem',
            background: 'oklch(from var(--bg) calc(l - 0.01) c h)',
          }}>
            {loading ? (
              <p style={{ ...muted, padding: '0.7rem 0.8rem' }}>loading...</p>
            ) : files.length === 0 ? (
              <p style={{ ...muted, padding: '0.7rem 0.8rem' }}>empty.</p>
            ) : (
              files.map(file => (
                <div
                  key={file.path}
                  style={{
                    display: 'flex',
                    gap: '0.75rem',
                    alignItems: 'center',
                    padding: '0.4rem 0.75rem',
                    borderBottom: '1px solid var(--border)',
                  }}
                >
                  <button
                    onClick={() => onOpenFile(file)}
                    style={{
                      ...mono,
                      color: 'var(--text)',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      textAlign: 'left',
                      flex: 1,
                      fontSize: '0.78rem',
                    }}
                  >
                    {file.type === 'dir' ? `${file.name}/` : file.name}
                  </button>
                  {file.type === 'file' && (
                    <button
                      onClick={() => onDeleteFile(file)}
                      style={{
                        ...mono,
                        color: 'var(--muted)',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: '0.6rem',
                        opacity: 0.7,
                      }}
                    >
                      delete
                    </button>
                  )}
                </div>
              ))
            )}
          </div>

          <button onClick={() => onNewFileOpenChange(!newFileOpen)} style={buttonStyle}>
            {newFileOpen ? 'cancel' : '+ new file'}
          </button>

          {newFileOpen && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginTop: '0.75rem', maxWidth: 480 }}>
              <input
                placeholder="filename.md"
                value={newFileName}
                onChange={e => onNewFileNameChange(e.target.value)}
                style={inputStyle}
              />
              <textarea
                placeholder="content..."
                value={newFileContent}
                onChange={e => onNewFileContentChange(e.target.value)}
                rows={4}
                style={{ ...inputStyle, resize: 'vertical' }}
              />
              <button onClick={onCreateFile} disabled={saving} style={accentButtonStyle}>
                create
              </button>
            </div>
          )}
        </>
      ) : (
        <>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '0.6rem' }}>
            <button onClick={onBack} style={{ ...muted, background: 'none', border: 'none', cursor: 'pointer' }}>
              ← back
            </button>
            <p style={{ ...mono, color: 'var(--text)', fontSize: '0.78rem' }}>{editingFile.path}</p>
          </div>
          <textarea
            value={editContent}
            onChange={e => onEditContentChange(e.target.value)}
            rows={14}
            style={{
              ...inputStyle,
              width: '100%',
              maxWidth: 720,
              padding: '0.7rem',
              resize: 'vertical',
              lineHeight: 1.7,
            }}
          />
          <div style={{ display: 'flex', gap: '1rem', marginTop: '0.6rem' }}>
            <button onClick={onSave} disabled={saving} style={accentButtonStyle}>
              {saving ? 'saving...' : 'save'}
            </button>
          </div>
        </>
      )}
    </section>
  );
}

export function ActivityLogPanel({
  open,
  loading,
  entries,
  panelStyle,
  mono,
  muted,
  buttonStyle,
  onToggle,
}: {
  open: boolean;
  loading: boolean;
  entries: { id: string; entry?: string; author?: string; timestamp?: unknown }[];
  panelStyle: PanelStyle;
  mono: PanelStyle;
  muted: PanelStyle;
  buttonStyle: PanelStyle;
  onToggle: () => void;
}) {
  const formatTime = (value: any) => {
    try {
      const ms = value?.seconds ? value.seconds * 1000 : Number(value);
      return ms ? new Date(ms).toLocaleString() : '';
    } catch {
      return '';
    }
  };

  return (
    <section style={panelStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: open ? '0.75rem' : 0 }}>
        <div style={{
          ...mono,
          color: 'var(--accent)',
          letterSpacing: '0.16em',
          textTransform: 'uppercase',
          opacity: 0.85,
        }}>
          Activity Log
        </div>
        <button
          onClick={onToggle}
          style={{ ...buttonStyle, fontSize: '0.65rem', padding: '0.25rem 0.7rem', borderRadius: 999 }}
        >
          {open ? 'hide' : 'show'}
        </button>
      </div>

      {open && (
        loading ? (
          <p style={muted}>loading...</p>
        ) : entries.length === 0 ? (
          <p style={muted}>no log entries yet.</p>
        ) : (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '0.35rem',
            maxHeight: '12rem',
            overflowY: 'auto',
          }}>
            {entries.map(item => (
              <div
                key={item.id}
                style={{
                  padding: '0.5rem 0.7rem',
                  borderLeft: '2px solid var(--border)',
                  background: 'oklch(from var(--bg) calc(l + 0.01) c h)',
                  borderRadius: '0 0.4rem 0.4rem 0',
                }}
              >
                <p style={{ color: 'var(--text)', fontSize: '0.8rem', lineHeight: 1.55, marginBottom: '0.15rem' }}>
                  {item.entry ?? '(no entry)'}
                </p>
                <p style={{ ...muted, fontSize: '0.58rem', opacity: 0.55 }}>
                  <span style={{ color: 'var(--accent)' }}>{item.author ?? 'unknown'}</span>
                  {item.timestamp ? ` · ${formatTime(item.timestamp)}` : ''}
                </p>
              </div>
            ))}
          </div>
        )
      )}
    </section>
  );
}
