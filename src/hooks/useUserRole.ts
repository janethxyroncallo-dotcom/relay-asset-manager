import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

type Role = 'admin' | 'editor' | 'viewer' | null;

export function useUserRole() {
  const [role, setRole] = useState<Role>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchRole() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user?.email) {
        setRole(null);
        setLoading(false);
        return;
      }

      const { data } = await supabase
        .from('user_roles')
        .select('role')
        .eq('email', user.email)
        .single();

      setRole((data?.role as Role) ?? 'viewer');
      setLoading(false);
    }

    fetchRole();
  }, []);

  return {
    role,
    loading,
    isAdmin: role === 'admin',
    isEditor: role === 'editor' || role === 'admin',
    canAccessNamer: role === 'admin' || role === 'editor',
    canAccessSettings: role === 'admin',
  };
}
