// Native Supabase REST Client
const SUPABASE_CONFIG = {
  url: "https://zxkikslpehynkhdyhugq.supabase.co",
  anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp4a2lrc2xwZWh5bmtoZHlodWdxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ1Njc5NjYsImV4cCI6MjExMDE0Mzk2Nn0.N_vGKJ7ZT4hiy40Sfa6l_7ZF1PN9oPlK5egZZzchQp0"
};

class NativeSupabase {
  constructor(config) {
    this.url = config.url;
    this.anonKey = config.anonKey;
    this.session = JSON.parse(localStorage.getItem('timebank_session') || 'null');
  }

  getHeaders(auth = true) {
    const h = {
      'apikey': this.anonKey,
      'Content-Type': 'application/json'
    };
    if (auth && this.session && this.session.access_token) {
      h['Authorization'] = 'Bearer ' + this.session.access_token;
    }
    return h;
  }

  async signIn(username, password) {
    const cleanUser = username.toLowerCase().trim();
    const email = cleanUser.includes('@') ? cleanUser : cleanUser + '@bancodehoras.app';
    const res = await fetch(this.url + '/auth/v1/token?grant_type=password', {
      method: 'POST',
      headers: this.getHeaders(false),
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error_description || data.msg || data.message || 'Usuário ou senha inválidos.');
    this.session = data;
    localStorage.setItem('timebank_session', JSON.stringify(data));
    return data;
  }

  async signUp(username, password, fullName, role = 'user') {
    const cleanUser = username.toLowerCase().trim();
    const email = cleanUser + '@bancodehoras.app';
    const res = await fetch(this.url + '/auth/v1/signup', {
      method: 'POST',
      headers: this.getHeaders(false),
      body: JSON.stringify({
        email,
        password,
        data: { username: cleanUser, full_name: fullName, role }
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.msg || data.message || 'Erro ao criar usuário.');
    return data;
  }

  async updatePassword(newPassword) {
    const res = await fetch(this.url + '/auth/v1/user', {
      method: 'PUT',
      headers: this.getHeaders(true),
      body: JSON.stringify({ password: newPassword })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || data.msg || 'Erro ao alterar senha.');
    return data;
  }

  async signOut() {
    if (this.session && this.session.access_token) {
      try {
        await fetch(this.url + '/auth/v1/logout', { method: 'POST', headers: this.getHeaders(true) });
      } catch(e) {}
    }
    this.session = null;
    localStorage.removeItem('timebank_session');
  }

  async select(table, query = '') {
    const url = `${this.url}/rest/v1/${table}${query ? '?' + query : ''}`;
    const res = await fetch(url, { method: 'GET', headers: this.getHeaders(true) });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Erro ao consultar banco.');
    }
    return await res.json();
  }

  async upsert(table, row) {
    const res = await fetch(`${this.url}/rest/v1/${table}`, {
      method: 'POST',
      headers: {
        ...this.getHeaders(true),
        'Prefer': 'resolution=merge-duplicates,return=representation'
      },
      body: JSON.stringify(row)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Erro ao gravar registro.');
    }
    return await res.json();
  }

  async delete(table, filter) {
    const res = await fetch(`${this.url}/rest/v1/${table}?${filter}`, {
      method: 'DELETE',
      headers: this.getHeaders(true)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Erro ao excluir.');
    }
    return true;
  }

  async rpc(fn, args = {}) {
    const res = await fetch(`${this.url}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: this.getHeaders(true),
      body: JSON.stringify(args)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || 'Erro no procedimento.');
    return data;
  }
}

const client = new NativeSupabase(SUPABASE_CONFIG);
