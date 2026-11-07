
/* ============================================================
   CUPISSA AUTH
   Autenticación centralizada para Perfil y Portal de Pagos.
   Requiere:
   - supabase-config.js
   - Supabase JS v2
   ============================================================ */

(function () {
  'use strict';

  const db =
    window.supabaseClient ||
    (typeof supabaseClient !== 'undefined' ? supabaseClient : null);

  if (!db) {
    console.error('[CUPISSA AUTH] No se encontró el cliente Supabase.');
    return;
  }

  const REDIRECT_URL = new URL('/perfil/', window.location.origin).toString();

  const DUPLICATE_PHONE =
    'EL TELEFONO YA ESTA REGISTRADO, RECUPERA TU CONTRASEÑA O USA UNO NUEVO';

  function cleanEmail(email) {
    return String(email || '').trim().toLowerCase();
  }

  function cleanPhone(phone) {
    return String(phone || '').trim().replace(/\s+/g, '');
  }

  function cleanName(name) {
    return String(name || '').trim().toLocaleUpperCase('es-CO');
  }

  function friendlyError(error) {
    const message = String(
      error?.message ||
      error?.details ||
      error?.hint ||
      ''
    ).toLowerCase();

    const code = String(error?.code || '').toLowerCase();

    if (
      message.includes('phone') ||
      message.includes('telefono') ||
      message.includes('teléfono') ||
      message.includes('duplicate key') ||
      code === '23505'
    ) {
      return DUPLICATE_PHONE;
    }

    if (
      message.includes('user already registered') ||
      message.includes('already registered') ||
      message.includes('already exists')
    ) {
      return 'Este correo ya tiene una cuenta. Inicia sesión o recupera tu contraseña.';
    }

    if (
      message.includes('invalid login credentials') ||
      message.includes('invalid credentials')
    ) {
      return 'El correo o la contraseña no son correctos.';
    }

    if (
      message.includes('email not confirmed')
    ) {
      return 'Debes verificar tu correo electrónico antes de ingresar.';
    }

    if (
      message.includes('expired') ||
      message.includes('otp_expired') ||
      message.includes('token has expired')
    ) {
      return 'El código ha vencido. Solicita uno nuevo.';
    }

    if (
      message.includes('invalid otp') ||
      message.includes('token is invalid') ||
      message.includes('invalid token')
    ) {
      return 'El código ingresado no es correcto. Verifícalo e inténtalo nuevamente.';
    }

    if (
      message.includes('rate limit') ||
      message.includes('too many requests')
    ) {
      return 'Has solicitado varios códigos. Espera unos minutos e inténtalo nuevamente.';
    }

    if (
      message.includes('password should be at least') ||
      message.includes('weak password')
    ) {
      return 'La contraseña debe tener al menos 6 caracteres.';
    }

    if (
      message.includes('email') &&
      (
        message.includes('valid') ||
        message.includes('format')
      )
    ) {
      return 'Escribe un correo electrónico válido.';
    }

    return 'No fue posible completar la operación. Verifica los datos e inténtalo nuevamente.';
  }

  function throwFriendly(error) {
    console.error('[CUPISSA AUTH]', error);
    const friendly = new Error(friendlyError(error));
    friendly.originalError = error;
    throw friendly;
  }

  function validateEmail(email) {
    const value = cleanEmail(email);

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      throw new Error('Escribe un correo electrónico válido.');
    }

    return value;
  }

  function validateOtp(code) {
    const value = String(code || '').trim();

    if (!/^\d{6}$/.test(value)) {
      throw new Error('Escribe el código de seis dígitos que recibiste.');
    }

    return value;
  }

  /* ============================================================
     USUARIO ACTUAL
     ============================================================ */

  async function getCurrentUser() {
    const { data, error } = await db.auth.getUser();

    if (error) throwFriendly(error);

    return data?.user || null;
  }

  /* ============================================================
     CUENTA CUPISSA VINCULADA
     ============================================================ */

  async function getLinkedAccount() {
    const user = await getCurrentUser();
    if (!user) return null;

    // RPC SECURITY DEFINER vincula clientes_web con el cliente legado por correo.
    // Si aún no está instalada, se intenta la resolución directa como respaldo.
    try {
      const resolved = await db.rpc('cupissa_resolve_my_account');
      if (!resolved.error && resolved.data) {
        const payload = resolved.data;
        if (payload.client) {
          const profileEmail = cleanEmail(payload.profile?.correo || user.email);
          return {
            user,
            profile: payload.profile || null,
            client: { ...payload.client, correo: cleanEmail(payload.client.correo || profileEmail) }
          };
        }
        if (payload.profile || payload.client === null) {
          return { user, profile: payload.profile || null, client: null };
        }
      }
    } catch (error) {
      console.warn('[CUPISSA AUTH] RPC de vinculación no disponible; se intentará resolver por correo.', error);
    }

    const email = cleanEmail(user.email);
    let profile = null;
    const byAuth = await db.from('clientes_web').select('*').eq('auth_user_id', user.id).limit(1).maybeSingle();
    if (byAuth.error) throwFriendly(byAuth.error);
    profile = byAuth.data;

    if (!profile && email) {
      const byEmail = await db.from('clientes_web').select('*').ilike('correo', email).limit(1).maybeSingle();
      if (byEmail.error) throwFriendly(byEmail.error);
      profile = byEmail.data;
    }

    let client = null;
    if (profile?.cliente_id) {
      const result = await db.from('clientes').select('*').eq('id', profile.cliente_id).limit(1).maybeSingle();
      if (result.error) throwFriendly(result.error);
      client = result.data;
    }

    if (!client && email) {
      const result = await db.from('clientes').select('*').ilike('correo', email).limit(1).maybeSingle();
      if (result.error) throwFriendly(result.error);
      client = result.data;
    }

    if (!client && profile?.telefono) {
      const result = await db.from('clientes').select('*').eq('telefono', cleanPhone(profile.telefono)).limit(1).maybeSingle();
      if (result.error) throwFriendly(result.error);
      client = result.data;
    }

    if (!client) return { user, profile: profile || null, client: null };

    const nameParts = String(client.nombre || '').trim().split(/\s+/).filter(Boolean);
    const patch = {
      auth_user_id: user.id,
      cliente_id: client.id,
      correo: email || profile?.correo || client.correo || '',
      telefono: profile?.telefono || client.telefono || ''
    };

    if (profile) {
      const updated = await db.from('clientes_web').update(patch).eq('id', profile.id).select('*').maybeSingle();
      if (!updated.error && updated.data) profile = updated.data;
      else if (updated.error) console.warn('[CUPISSA AUTH] No se pudo actualizar el vínculo del perfil:', updated.error);
    } else {
      const inserted = await db.from('clientes_web').insert([{
        ...patch,
        nombres: nameParts.shift() || 'CLIENTE',
        apellidos: nameParts.join(' '),
        direccion: '', barrio: '', ciudad: ''
      }]).select('*').maybeSingle();
      if (!inserted.error) profile = inserted.data;
      else console.warn('[CUPISSA AUTH] No se pudo crear el perfil web:', inserted.error);
    }

    return {
      user,
      profile,
      client: { ...client, correo: cleanEmail(client.correo || profile?.correo || email) }
    };
  }

  /* ============================================================
     COMPROBAR TELÉFONO REGISTRADO
     ============================================================ */

  async function checkPhoneAvailable(phone) {
    const telefono = cleanPhone(phone);

    if (!telefono) {
      throw new Error('Ingresa tu número de teléfono.');
    }

    const { data, error } = await db
      .from('clientes')
      .select('id')
      .eq('telefono', telefono)
      .limit(1);

    if (error) throwFriendly(error);

    if (data && data.length > 0) {
      throw new Error(DUPLICATE_PHONE);
    }

    return true;
  }

  /* ============================================================
     REGISTRO TRADICIONAL
     Crea el usuario Auth y envía OTP de registro.
     El cliente CUPISSA se crea DESPUÉS de verificar el OTP.
     ============================================================ */

  async function signUp({
    email,
    password,
    nombres,
    apellidos,
    telefono
  }) {
    const correo = validateEmail(email);
    const celular = cleanPhone(telefono);

    if (!cleanName(nombres)) {
      throw new Error('Ingresa tus nombres.');
    }

    if (!cleanName(apellidos)) {
      throw new Error('Ingresa tus apellidos.');
    }

    if (!celular) {
      throw new Error('Ingresa tu número de teléfono.');
    }

    if (!password || String(password).length < 6) {
      throw new Error('La contraseña debe tener al menos 6 caracteres.');
    }

    await checkPhoneAvailable(celular);

    const { data, error } = await db.auth.signUp({
      email: correo,
      password: String(password),
      options: {
        emailRedirectTo: REDIRECT_URL,
        data: {
          nombres: cleanName(nombres),
          apellidos: cleanName(apellidos),
          telefono: celular,
          cupissa_registration: true
        }
      }
    });

    if (error) throwFriendly(error);

    return {
      user: data.user,
      session: data.session,
      email: correo,
      telefono: celular,
      nombres: cleanName(nombres),
      apellidos: cleanName(apellidos),
      otpRequired: true
    };
  }

  /* ============================================================
     VERIFICAR OTP DE REGISTRO
     ============================================================ */

  async function verifySignupOtp(email, code) {
    const correo = validateEmail(email);
    const token = validateOtp(code);

    const { data, error } = await db.auth.verifyOtp({
      email: correo,
      token,
      type: 'signup'
    });

    if (error) throwFriendly(error);

    return data;
  }

  /* ============================================================
     REENVIAR OTP DE REGISTRO
     ============================================================ */

  async function resendSignupOtp(email) {
    const correo = validateEmail(email);

    const { data, error } = await db.auth.resend({
      type: 'signup',
      email: correo
    });

    if (error) throwFriendly(error);

    return data;
  }

  /* ============================================================
     CREAR CLIENTE CUPISSA DESPUÉS DE VERIFICAR OTP
     Requiere RPC cupissa_create_new_client.
     ============================================================ */

  async function createNewClient({
    telefono,
    nombres,
    apellidos
  }) {
    const celular = cleanPhone(telefono);

    const { data, error } = await db.rpc(
      'cupissa_create_new_client',
      {
        p_telefono: celular,
        p_nombres: cleanName(nombres),
        p_apellidos: cleanName(apellidos)
      }
    );

    if (error) throwFriendly(error);

    if (data?.ok === false) {
      throw new Error(
        data.message || 'No fue posible crear tu cuenta CUPISSA.'
      );
    }

    return data;
  }

  /* ============================================================
     INICIAR SESIÓN CON CORREO (CÓDIGO OTP, SIN CONTRASEÑA)
     ============================================================ */

  async function sendEmailLoginOtp(email, redirectTo = REDIRECT_URL) {
    const correo = validateEmail(email);
    const { data, error } = await db.auth.signInWithOtp({
      email: correo,
      options: { shouldCreateUser: true, emailRedirectTo: redirectTo || REDIRECT_URL }
    });
    if (error) throwFriendly(error);
    return data;
  }

  async function verifyEmailLoginOtp(email, code) {
    const correo = validateEmail(email);
    const token = validateOtp(code);
    const { data, error } = await db.auth.verifyOtp({ email: correo, token, type: 'email' });
    if (error) throwFriendly(error);
    return data;
  }

  /* ============================================================
     INICIAR SESIÓN LEGADO (se conserva para compatibilidad)
     ============================================================ */

  async function signIn(email, password) {
    const correo = validateEmail(email);

    if (!password) {
      throw new Error('Ingresa tu contraseña.');
    }

    const { data, error } = await db.auth.signInWithPassword({
      email: correo,
      password: String(password)
    });

    if (error) throwFriendly(error);

    return data;
  }

  /* ============================================================
     GOOGLE: INICIAR AUTENTICACIÓN
     ============================================================ */

  async function signInGoogle(intent = 'login', redirectTo = REDIRECT_URL) {
    const validIntent = intent === 'register' ? 'register' : 'login';

    sessionStorage.setItem(
      'cupissa_google_intent',
      validIntent
    );

    const { data, error } = await db.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectTo || REDIRECT_URL,
        queryParams: {
          access_type: 'offline',
          prompt: 'select_account'
        }
      }
    });

    if (error) throwFriendly(error);

    return data;
  }

  async function signUpGoogle() {
    return signInGoogle('register');
  }

  function getGoogleIntent() {
    return sessionStorage.getItem('cupissa_google_intent') || '';
  }

  function clearGoogleIntent() {
    sessionStorage.removeItem('cupissa_google_intent');
  }

  async function getGoogleUserData() {
    const user = await getCurrentUser();

    if (!user) {
      throw new Error('No se pudo recuperar tu cuenta de Google.');
    }

    const metadata = user.user_metadata || {};

    return {
      user,
      email: cleanEmail(user.email),
      nombres: cleanName(
        metadata.full_name ||
        metadata.name ||
        metadata.given_name ||
        ''
      ),
      apellidos: cleanName(
        metadata.family_name || ''
      )
    };
  }

  /* ============================================================
     GOOGLE: ENVIAR SEGUNDO OTP
     Este paso es obligatorio para el registro CUPISSA con Google.
     ============================================================ */

  async function sendGoogleRegistrationOtp(email) {
    const correo = validateEmail(email);

    const user = await getCurrentUser();

    if (!user || cleanEmail(user.email) !== correo) {
      throw new Error(
        'No pudimos validar tu cuenta de Google. Inténtalo nuevamente.'
      );
    }

    const { data, error } = await db.auth.signInWithOtp({
      email: correo,
      options: {
        shouldCreateUser: false,
        emailRedirectTo: REDIRECT_URL,
        data: {
          cupissa_google_registration: true
        }
      }
    });

    if (error) throwFriendly(error);

    return data;
  }

  /* ============================================================
     GOOGLE: VERIFICAR SEGUNDO OTP
     ============================================================ */

  async function verifyGoogleRegistrationOtp(email, code) {
    const correo = validateEmail(email);
    const token = validateOtp(code);

    const { data, error } = await db.auth.verifyOtp({
      email: correo,
      token,
      type: 'email'
    });

    if (error) throwFriendly(error);

    return data;
  }

  /* ============================================================
     RECUPERAR CUENTA ANTIGUA
     Vincula el usuario autenticado con el cliente anterior.
     ============================================================ */

  async function linkLegacyAccount({
    telefono,
    password,
    nombres,
    apellidos
  }) {
    const user = await getCurrentUser();

    if (!user) {
      throw new Error(
        'Primero debes iniciar sesión con tu correo electrónico.'
      );
    }

    const celular = cleanPhone(telefono);

    if (!celular || !password) {
      throw new Error(
        'Completa el teléfono y la contraseña de tu cuenta anterior.'
      );
    }

    const { data, error } = await db.rpc(
      'cupissa_link_legacy_account',
      {
        p_telefono: celular,
        p_password_anterior: String(password),
        p_nombres: cleanName(nombres),
        p_apellidos: cleanName(apellidos)
      }
    );

    if (error) throwFriendly(error);

    if (data?.ok === false) {
      throw new Error(
        data.message ||
        'No fue posible vincular tu cuenta anterior. Verifica tus datos.'
      );
    }

    return data;
  }

  /* ============================================================
     RECUPERACIÓN DE CONTRASEÑA POR OTP
     ============================================================ */

  async function sendPasswordRecoveryOtp(email) {
    const correo = validateEmail(email);

    const { data, error } = await db.auth.resetPasswordForEmail(
      correo,
      {
        redirectTo: REDIRECT_URL
      }
    );

    if (error) throwFriendly(error);

    return data;
  }

  async function verifyPasswordRecoveryOtp(email, code) {
    const correo = validateEmail(email);
    const token = validateOtp(code);

    const { data, error } = await db.auth.verifyOtp({
      email: correo,
      token,
      type: 'recovery'
    });

    if (error) throwFriendly(error);

    return data;
  }

  async function updatePassword(password) {
    if (!password || String(password).length < 6) {
      throw new Error(
        'La nueva contraseña debe tener al menos 6 caracteres.'
      );
    }

    const { data, error } = await db.auth.updateUser({
      password: String(password)
    });

    if (error) throwFriendly(error);

    return data;
  }

  /* ============================================================
     CAMBIO DE CORREO CON OTP
     ============================================================ */

  async function sendEmailChangeOtp(newEmail) {
    const correo = validateEmail(newEmail);

    const user = await getCurrentUser();

    if (!user) {
      throw new Error(
        'Debes iniciar sesión para cambiar tu correo.'
      );
    }

    if (cleanEmail(user.email) === correo) {
      throw new Error(
        'Este ya es el correo asociado a tu cuenta.'
      );
    }

    const { data, error } = await db.auth.updateUser({
      email: correo
    });

    if (error) throwFriendly(error);

    return data;
  }

  async function verifyEmailChangeOtp(email, code) {
    const correo = validateEmail(email);
    const token = validateOtp(code);

    const { data, error } = await db.auth.verifyOtp({
      email: correo,
      token,
      type: 'email_change'
    });

    if (error) throwFriendly(error);

    const sync = await db.rpc('cupissa_sync_my_email');

    if (sync.error) {
      console.error(
        '[CUPISSA AUTH] No se pudo sincronizar el correo:',
        sync.error
      );
    }

    return data;
  }

  /* ============================================================
     CERRAR SESIÓN
     ============================================================ */

  async function signOut() {
    const { error } = await db.auth.signOut();

    if (error) throwFriendly(error);

    localStorage.removeItem('cupissa_client_session');
    sessionStorage.removeItem('cupissa_google_intent');

    return true;
  }

  /* ============================================================
     EXPORTAR FUNCIONES
     ============================================================ */

  window.CUPISSAAuth = {
    getCurrentUser,
    getLinkedAccount,

    checkPhoneAvailable,

    signUp,
    verifySignupOtp,
    resendSignupOtp,
    createNewClient,

    signIn,
    sendEmailLoginOtp,
    verifyEmailLoginOtp,

    signInGoogle,
    signUpGoogle,
    getGoogleIntent,
    clearGoogleIntent,
    getGoogleUserData,
    sendGoogleRegistrationOtp,
    verifyGoogleRegistrationOtp,

    linkLegacyAccount,

    sendPasswordRecoveryOtp,
    verifyPasswordRecoveryOtp,
    updatePassword,

    sendEmailChangeOtp,
    verifyEmailChangeOtp,

    signOut,

    friendlyError
  };

  console.info('[CUPISSA AUTH] Sistema de autenticación cargado.');
})();
