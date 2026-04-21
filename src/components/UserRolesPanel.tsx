'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

type Role = 'admin' | 'editor' | 'viewer';
type UserRole = { id: string; email: string; role: Role; created_at: string };

export default function UserRolesPanel() {
    const [users, setUsers] = useState<UserRole[]>([]);
    const [loading, setLoading] = useState(true);
    const [newEmail, setNewEmail] = useState('');
    const [newRole, setNewRole] = useState<Role>('viewer');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const supabase = createClient();

    async function fetchUsers() {
        const { data } = await supabase.from('user_roles').select('*').order('created_at');
        setUsers(data ?? []);
        setLoading(false);
    }

    useEffect(() => { fetchUsers(); }, []);

    async function addUser() {
        if (!newEmail.endsWith('@mykitsch.com')) {
            setError('Only @mykitsch.com emails are allowed.');
            return;
        }
        setSaving(true);
        setError(null);
        const { error } = await supabase.from('user_roles').insert({ email: newEmail, role: newRole });
        if (error) setError(error.message);
        else { setNewEmail(''); await fetchUsers(); }
        setSaving(false);
    }

    async function updateRole(id: string, role: Role) {
        await supabase.from('user_roles').update({ role }).eq('id', id);
        await fetchUsers();
    }

    async function removeUser(id: string) {
        await supabase.from('user_roles').delete().eq('id', id);
        await fetchUsers();
    }

    if (loading) return <div style={{ color: 'var(--ram-text-tertiary)', padding: '16px' }}>Loading users...</div>;

    return (
        <div style={{ padding: '16px' }}>
            <h3 style={{ color: 'var(--ram-text-primary)', fontSize: '14px', fontWeight: 600, marginBottom: '16px' }}>
                Team Access
            </h3>

            {/* Add user */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                <input
                    type="email"
                    placeholder="name@mykitsch.com"
                    value={newEmail}
                    onChange={e => setNewEmail(e.target.value)}
                    style={{
                        flex: 1, padding: '6px 10px', borderRadius: '8px', fontSize: '12px',
                        background: 'var(--ram-bg-elevated)', border: '1px solid var(--ram-border)',
                        color: 'var(--ram-text-primary)',
                    }}
                />
                <select
                    value={newRole}
                    onChange={e => setNewRole(e.target.value as Role)}
                    style={{
                        padding: '6px 10px', borderRadius: '8px', fontSize: '12px',
                        background: 'var(--ram-bg-elevated)', border: '1px solid var(--ram-border)',
                        color: 'var(--ram-text-primary)',
                    }}
                >
                    <option value="viewer">Viewer</option>
                    <option value="editor">Editor</option>
                    <option value="admin">Admin</option>
                </select>
                <button
                    onClick={addUser}
                    disabled={saving || !newEmail}
                    style={{
                        padding: '6px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 600,
                        background: 'var(--ram-accent)', color: 'white', border: 'none', cursor: 'pointer',
                        opacity: saving || !newEmail ? 0.5 : 1,
                    }}
                >
                    Add
                </button>
            </div>

            {error && (
                <div style={{ color: 'var(--ram-red)', fontSize: '12px', marginBottom: '12px' }}>{error}</div>
            )}

            {/* User list */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {users.map(u => (
                    <div key={u.id} style={{
                        display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px',
                        borderRadius: '8px', background: 'var(--ram-bg-elevated)', border: '1px solid var(--ram-border)',
                    }}>
                        <span style={{ flex: 1, fontSize: '12px', color: 'var(--ram-text-primary)' }}>{u.email}</span>
                        <select
                            value={u.role}
                            onChange={e => updateRole(u.id, e.target.value as Role)}
                            style={{
                                padding: '4px 8px', borderRadius: '6px', fontSize: '11px',
                                background: 'var(--ram-surface)', border: '1px solid var(--ram-border)',
                                color: 'var(--ram-text-primary)',
                            }}
                        >
                            <option value="viewer">Viewer</option>
                            <option value="editor">Editor</option>
                            <option value="admin">Admin</option>
                        </select>
                        <button
                            onClick={() => removeUser(u.id)}
                            style={{
                                padding: '4px 8px', borderRadius: '6px', fontSize: '11px',
                                background: 'var(--ram-red-bg)', color: 'var(--ram-red)',
                                border: '1px solid rgba(248,113,113,0.2)', cursor: 'pointer',
                            }}
                        >
                            Remove
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
}
