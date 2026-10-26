/**
 * Login web por OTP (teléfono) — flujo del modal.
 * Pasos: teléfono → código → (registro si phone_not_registered).
 * Backend: application/auth-login.php (admin-ajax). Config: window.rogansLogin.
 */
jQuery(function ($) {
  var CFG = window.rogansLogin || {};
  var $modal = $('#rogans-login-modal');
  if (!$modal.length || !CFG.ajaxUrl) return;

  var state = { phone: '', expiresIn: 180, timer: null };

  /* ---------- Helpers UI / animaciones ---------- */
  var $card = $modal.find('.rogans-login-card');
  function openModal() {
    goStep('phone', true);
    $modal.removeClass('hidden').addClass('flex').css('opacity', 0);
    $card.css({ opacity: 0, transform: 'translateY(10px) scale(.98)' });
    // siguiente frame → animar entrada
    requestAnimationFrame(function () {
      $modal.css({ transition: 'opacity .2s ease', opacity: 1 });
      $card.css({ transition: 'opacity .25s ease, transform .25s ease', opacity: 1, transform: 'translateY(0) scale(1)' });
    });
    refreshNonce(); // nonce fresco por si la página venía cacheada
    if (window.lucide && window.lucide.createIcons) { window.lucide.createIcons(); }
  }
  function closeModal() {
    $modal.css({ transition: 'opacity .2s ease', opacity: 0 });
    $card.css({ transition: 'opacity .2s ease, transform .2s ease', opacity: 0, transform: 'translateY(10px) scale(.98)' });
    setTimeout(function () {
      $modal.removeClass('flex').addClass('hidden').css('opacity', '');
      $card.css({ opacity: '', transform: '', transition: '' });
      clearTimer();
      hideMsg();
    }, 210);
  }
  function goStep(step, instant) {
    $modal.find('.rogans-login-step').addClass('hidden');
    var $target = $modal.find('.rogans-login-step[data-step="' + step + '"]').removeClass('hidden');
    hideMsg();
    if (window.lucide && window.lucide.createIcons) { window.lucide.createIcons(); }
    if (!instant) {
      // fade-in al cambiar de paso
      $target.css({ opacity: 0, transform: 'translateY(6px)' });
      requestAnimationFrame(function () {
        $target.css({ transition: 'opacity .22s ease, transform .22s ease', opacity: 1, transform: 'translateY(0)' });
      });
    } else {
      $target.css({ opacity: '', transform: '', transition: '' });
    }
  }
  function showMsg(text, type) {
    var style = (type === 'error')
      ? 'background:#fef2f2;color:#dc2626;border:1px solid #fecaca;'
      : 'background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe;';
    // Si el paso visible tiene su propio contenedor (ej. registro, debajo del
    // botón) se usa ese → el usuario lo ve sin hacer scroll; si no, el de arriba.
    var $step = $modal.find('.rogans-login-step:not(.hidden)').first();
    var $inline = $step.find('.rogans-login-msg-step').first();
    var $m, base;
    if ($inline.length) {
      $m = $inline; base = 'rogans-login-msg-step mt-3 rounded-lg px-4 py-3 text-sm leading-snug';
    } else {
      $m = $modal.find('.rogans-login-msg').first(); base = 'rogans-login-msg mx-6 mt-6 -mb-2 rounded-lg px-4 py-3 text-sm leading-snug';
    }
    $m.attr('class', base).attr('style', style).text(text).removeClass('hidden');
    if ($inline.length && $m[0] && $m[0].scrollIntoView) $m[0].scrollIntoView({ block: 'nearest' });
  }
  function hideMsg() { $modal.find('.rogans-login-msg, .rogans-login-msg-step').addClass('hidden'); }
  function btnLoading($btn, loading, label) {
    if (loading) {
      $btn.data('label', $btn.html()).prop('disabled', true)
        .html('<span class="inline-flex items-center gap-2"><span class="animate-spin inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full"></span> Procesando...</span>');
    } else {
      $btn.prop('disabled', false).html(label || $btn.data('label') || '');
    }
  }

  /* ---------- Teléfono (helpers por campo) ---------- */
  function codeFromField(radioName) {
    var $r = $modal.find('input[name="' + radioName + '"]:checked');
    return $r.length ? ($r.closest('.custom-select-image-option').data('code') || '') : '';
  }
  function isoFromField(radioName) {
    var $r = $modal.find('input[name="' + radioName + '"]:checked');
    return $r.length ? $r.val() : '';
  }
  function fullPhone(telId, radioName) {
    return String(codeFromField(radioName)) + $('#' + telId).val().replace(/\D/g, '');
  }
  function setCountry(radioName, iso) {
    var $input = $modal.find('input[name="' + radioName + '"][value="' + iso + '"]');
    if (!$input.length) return;
    var $opt = $input.closest('.custom-select-image-option');
    $modal.find('input[name="' + radioName + '"]').prop('checked', false);
    $input.prop('checked', true);
    var $csi = $opt.closest('.custom-select-image');
    $csi.find('.custom-select-image-flag').attr('src', $opt.data('flag')).attr('alt', $opt.data('name'));
    $csi.find('.custom-select-image-text').text($opt.data('name')).removeClass('hidden');
    $csi.find('.custom-select-image-placeholder').addClass('hidden');
    $csi.find('.custom-select-image-selected').removeClass('hidden').addClass('flex');
  }
  // Copia el teléfono del paso 1 al campo del paso de registro.
  function prefillRegisterPhone() {
    setCountry('login_reg_country_flag', isoFromField('login_country_flag') || 'CO');
    $('#loginRegPhone').val($('#loginPhone').val().replace(/\D/g, ''));
  }

  // Solo dígitos
  $('#loginPhone, #loginRegPhone').on('input', function () { this.value = this.value.replace(/\D/g, ''); });

  /* ---------- OTP de 6 casillas ---------- */
  var $otp = $modal.find('.rogans-otp-digit');
  function syncCode() {
    var code = '';
    $otp.each(function () { code += (this.value || '').replace(/\D/g, ''); });
    $('#loginCode').val(code);
    return code;
  }
  function resetOtp() { $otp.val(''); $('#loginCode').val(''); if ($otp[0]) $otp[0].focus(); }
  function maybeAutoSubmit() {
    if (syncCode().length !== 6) return;
    var $vb = $modal.find('.rogans-login-verify');
    if ($vb.prop('disabled')) return;               // ya hay una verificación en curso
    setTimeout(function () { $vb.trigger('click'); }, 90);
  }
  // Llena las casillas desde `start` con los dígitos dados, enfoca la siguiente.
  function fillOtpFrom(start, digits) {
    for (var i = 0; i < digits.length && (start + i) < $otp.length; i++) $otp[start + i].value = digits.charAt(i);
    var next = Math.min(start + digits.length, $otp.length - 1);
    if ($otp[next]) $otp[next].focus();
    maybeAutoSubmit();
  }
  $otp.on('focus', function () { this.select(); });
  $otp.on('input', function () {
    var idx = $otp.index(this);
    var v = (this.value || '').replace(/\D/g, '');
    if (v.length > 1) { this.value = ''; fillOtpFrom(0, v.slice(0, 6)); return; } // autofill/pegado dentro del input → desde el 1º
    this.value = v;
    if (v && idx < $otp.length - 1) $otp[idx + 1].focus();
    maybeAutoSubmit();
  });
  $otp.on('keydown', function (e) {
    var idx = $otp.index(this);
    if (e.key === 'Backspace') {
      if (this.value) { this.value = ''; syncCode(); }
      else if (idx > 0) { $otp[idx - 1].value = ''; $otp[idx - 1].focus(); syncCode(); e.preventDefault(); }
    } else if (e.key === 'ArrowLeft' && idx > 0) { $otp[idx - 1].focus(); e.preventDefault(); }
    else if (e.key === 'ArrowRight' && idx < $otp.length - 1) { $otp[idx + 1].focus(); e.preventDefault(); }
  });
  $otp.on('paste', function (e) {
    e.preventDefault();
    var cd = (e.originalEvent || e).clipboardData;
    var digits = ((cd && cd.getData('text')) || '').replace(/\D/g, '').slice(0, 6);
    if (digits) fillOtpFrom(0, digits);            // pegar en CUALQUIER casilla → llena desde el 1º, en orden
  });

  /* ---------- Countdown ---------- */
  function clearTimer() { if (state.timer) { clearInterval(state.timer); state.timer = null; } }
  function startCountdown(secs) {
    clearTimer();
    var left = parseInt(secs, 10) || 180;
    var $cd = $modal.find('.rogans-login-countdown');
    var $resend = $modal.find('.rogans-login-resend');
    $resend.addClass('hidden');
    function tick() {
      if (left <= 0) {
        clearTimer();
        $cd.text('¿No te llegó? ');
        $resend.removeClass('hidden');
        return;
      }
      var m = Math.floor(left / 60), s = left % 60;
      $cd.text('El código vence en ' + m + ':' + (s < 10 ? '0' : '') + s + ' ');
      left--;
    }
    tick();
    state.timer = setInterval(tick, 1000);
  }

  /* ---------- AJAX ---------- */
  // Trae un nonce fresco (admin-ajax no se cachea) → robusto con LiteSpeed.
  function refreshNonce() {
    return $.post(CFG.ajaxUrl, { action: 'rogans_auth_nonce' }).done(function (res) {
      if (res && res.success && res.data && res.data.nonce) CFG.nonce = res.data.nonce;
    });
  }
  // POST con reintento único si el nonce expiró (HTTP 403).
  function post(action, data) {
    var dfd = $.Deferred();
    function attempt(retried) {
      $.post(CFG.ajaxUrl, $.extend({ action: action, nonce: CFG.nonce }, data))
        .done(function (res) { dfd.resolve(res); })
        .fail(function (xhr) {
          if (!retried && xhr.status === 403) {
            refreshNonce().always(function () { attempt(true); });
          } else {
            dfd.reject(xhr);
          }
        });
    }
    attempt(false);
    return dfd.promise();
  }

  /* ---------- Acciones ---------- */
  // Paso 1: enviar OTP
  $modal.on('click', '.rogans-login-send-otp', function () {
    var $btn = $(this);
    var phone = fullPhone('loginPhone', 'login_country_flag');
    if (!codeFromField('login_country_flag')) { showMsg('Selecciona el país.', 'error'); return; }
    if ($('#loginPhone').val().replace(/\D/g, '').length < 7) { showMsg('Ingresa un teléfono válido.', 'error'); return; }
    state.phone = phone;
    btnLoading($btn, true);
    post('rogans_auth_request_otp', { phone: phone })
      .done(function (res) {
        if (res && res.success) {
          state.expiresIn = (res.data && res.data.expires_in) || 180;
          $modal.find('.rogans-login-phone-label').text('+' + phone);
          goStep('code');
          resetOtp();
          startCountdown(state.expiresIn);
        } else {
          var err = res && res.data ? res.data : {};
          if (err.error === 'phone_not_registered') {
            prefillRegisterPhone();
            goStep('register');
          } else {
            showMsg((err && err.message) || 'No se pudo enviar el código.', 'error');
          }
        }
      })
      .fail(function (xhr) {
        var d = xhr.responseJSON && xhr.responseJSON.data ? xhr.responseJSON.data : {};
        if (d.error === 'phone_not_registered') { prefillRegisterPhone(); goStep('register'); }
        else { showMsg(d.message || 'No se pudo enviar el código.', 'error'); }
      })
      .always(function () { btnLoading($btn, false, 'Enviar código'); });
  });

  // Reenviar
  $modal.on('click', '.rogans-login-resend', function () {
    if (!state.phone) return goStep('phone');
    post('rogans_auth_request_otp', { phone: state.phone })
      .done(function (res) {
        if (res && res.success) {
          state.expiresIn = (res.data && res.data.expires_in) || 180;
          startCountdown(state.expiresIn);
          showMsg('Te reenviamos el código.', 'info');
        } else {
          showMsg((res.data && res.data.message) || 'No se pudo reenviar.', 'error');
        }
      });
  });

  // Paso 2: verificar
  $modal.on('click', '.rogans-login-verify', function () {
    var $btn = $(this);
    var code = $('#loginCode').val().replace(/\D/g, '');
    if (code.length < 4) { showMsg('Ingresa el código completo.', 'error'); return; }
    btnLoading($btn, true);
    post('rogans_auth_verify_otp', { phone: state.phone, code: code })
      .done(function (res) {
        if (res && res.success) {
          showMsg('¡Bienvenido! Iniciando sesión...', 'info');
          // Tras iniciar sesión, volver a donde el visitante queria ir. Ese
          // destino lo arma el servidor a partir de la seccion pedida (y solo
          // si es una conocida), no se toma de la URL: asi no hay forma de
          // usarlo para mandar a la gente a otro sitio. Si no hay, cae en
          // "Mi cuenta" como siempre.
          window.location.href = (window.RogansLoginDestino || CFG.accountUrl || '/perfil');
        } else {
          showMsg((res.data && res.data.message) || 'Código inválido o vencido.', 'error');
        }
      })
      .fail(function (xhr) {
        var d = xhr.responseJSON && xhr.responseJSON.data ? xhr.responseJSON.data : {};
        showMsg(d.message || 'Código inválido o vencido.', 'error');
      })
      .always(function () { btnLoading($btn, false, 'Verificar e iniciar sesión'); });
  });

  // Paso 3: registrar
  $modal.on('click', '.rogans-login-register', function () {
    var $btn = $(this);
    var phone = fullPhone('loginRegPhone', 'login_reg_country_flag');
    if (!codeFromField('login_reg_country_flag')) { showMsg('Selecciona el país.', 'error'); return; }
    if ($('#loginRegPhone').val().replace(/\D/g, '').length < 7) { showMsg('Ingresa un teléfono válido.', 'error'); return; }
    var name = $('#loginRegName').val().trim();
    if (name.length < 2) { showMsg('Ingresa tu nombre completo.', 'error'); return; }
    state.phone = phone;
    btnLoading($btn, true);
    post('rogans_auth_register', {
      phone: phone,
      name: name,
      vat: $('#loginRegVat').val().trim(),
      email: $('#loginRegEmail').val().trim(),
      street: $('#loginRegStreet').val().trim(),
      city: $('#loginRegCity').val().trim(),
      mobile: phone,          // mismo número que phone
      rogans_partner_id: ''   // vacío por ahora (referido — se usará luego)
    })
      .done(function (res) {
        if (res && res.success) {
          state.expiresIn = (res.data && res.data.expires_in) || 180;
          goStep('code');
          resetOtp();
          startCountdown(state.expiresIn);
        } else {
          showMsg((res.data && res.data.message) || 'No se pudo crear la cuenta.', 'error');
        }
      })
      .fail(function (xhr) {
        var d = xhr.responseJSON && xhr.responseJSON.data ? xhr.responseJSON.data : {};
        showMsg(d.message || 'No se pudo crear la cuenta.', 'error');
      })
      .always(function () { btnLoading($btn, false, 'Crear cuenta y enviar código'); });
  });

  /* ---------- Navegación / abrir-cerrar ---------- */
  $(document).on('click', '.rogans-open-login', function (e) { e.preventDefault(); openModal(); });
  $modal.on('click', '.rogans-login-close, .rogans-login-overlay', closeModal);
  $modal.on('click', '.rogans-login-back', function () { goStep($(this).data('target') || 'phone'); });
  // Ir al registro desde el paso de teléfono (enlace "Regístrate").
  $modal.on('click', '.rogans-login-goregister', function () { prefillRegisterPhone(); goStep('register'); });
  $(document).on('keydown', function (e) { if (e.key === 'Escape' && $modal.hasClass('flex')) closeModal(); });

  setCountry('login_country_flag', 'CO');
  setCountry('login_reg_country_flag', 'CO');
});
