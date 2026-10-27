(function() {
  'use strict';

  function showBody() {
    // El preloader (inc/preloader.php) destapa el body y se quita a sí mismo;
    // lo de abajo queda como respaldo por si esa función no existiera.
    if (typeof window.rogansOcultarPreloader === 'function') {
      window.rogansOcultarPreloader();
      return;
    }
    const body = document.body;
    if (body) {
      body.style.opacity = '1';
      body.style.visibility = 'visible';
      body.style.transition = 'opacity 0.3s ease-in-out';
    }
  };

  function loadScript(src, callback) {
    var script = document.createElement('script');
    script.src = src + '?v=' + Date.now();
    script.onload = callback;
    document.head.appendChild(script);
  };

  function loadMainDependencies(callback) {
    var dependencies = [
      URL_TEMPLATE + '/application/application.js',
      'https://unpkg.com/lucide@latest',
    ];
    
    var loaded = 0;
    function checkLoaded() {
      loaded++;
      if(loaded >= dependencies.length) {
        callback();
      }
    }
    
    dependencies.forEach(function(src) {
      loadScript(src, checkLoaded);
    });
  };

  // CSS de owl (idempotente): se necesita tanto si owl vino cargado desde el
  // header (script estático) como si lo descarga el loader dinámico.
  function ensureOwlCss() {
    if (document.getElementById('rogans-owl-css')) return;

    const link = document.createElement("link");
    link.id = 'rogans-owl-css';
    link.rel = "stylesheet";
    link.href = URL_TEMPLATE + '/css/owl.carousel.min.css?v=' + Date.now();
    document.head.appendChild(link);

    const linkTheme = document.createElement("link");
    linkTheme.rel = "stylesheet";
    linkTheme.href = URL_TEMPLATE + '/css/owl.theme.default.min.css?v=' + Date.now();
    document.head.appendChild(linkTheme);
  };

  function loadOwlCarousel(callback) {
    if(typeof $.fn.owlCarousel === "function") {
      ensureOwlCss();
      callback();
      return;
    }

    const script = document.createElement('script');
    script.src = URL_TEMPLATE + '/js/owl.carousel.min.js?v=' + Date.now();
    script.onload = function() {
      // Puente doble-jQuery: si owl se registró en el jQuery de WP (Rocket
      // Loader lo ejecuta tarde y reemplaza window.jQuery), copiar el plugin
      // al jQuery del tema que usa este archivo.
      if (typeof $.fn.owlCarousel !== 'function' && window.jQuery && window.jQuery.fn && typeof window.jQuery.fn.owlCarousel === 'function') {
        $.fn.owlCarousel = window.jQuery.fn.owlCarousel;
      }
      ensureOwlCss();
      callback();
    };

    document.head.appendChild(script);
  };

  function loadPignoseCalendar(callback) {
    if(typeof $.fn.pignoseCalendar === "function") {
      callback();
      return;
    }
    
    const script = document.createElement('script');
    script.src = URL_TEMPLATE + '/js/pignose.calendar.full.min.js?v=' + Date.now();
    script.onload = function() {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = URL_TEMPLATE + '/css/pignose.calendar.min.css?v=' + Date.now();
      document.head.appendChild(link);
      
      callback();
    };
    document.head.appendChild(script);
  };

  function loadIsotope(callback) {
    // OJO: la verificación correcta es $.fn.isotope (no $.fn.isotope === "function" siempre da igual, pero ok)
    if (typeof $.fn.isotope === "function") {
      callback();
      return;
    }
  
    const script = document.createElement('script');
    script.src = URL_TEMPLATE + '/js/isotope.min.js?v=' + Date.now();
    script.onload = callback;
    script.onerror = function () {
      console.error('No se pudo cargar Isotope:', script.src);
    };
  
    document.head.appendChild(script);
  };
  
  // Hacer la función disponible globalmente
  window.loadPignoseCalendar = loadPignoseCalendar;

  // Mueve un carrusel de owl DESDE LA INSTANCIA DE JQUERY CORRECTA.
  //
  // En este sitio conviven dos jQuery distintos (el de WordPress y el que queda
  // en window.$; Rocket Loader reemplaza window.jQuery tarde). Owl guarda la
  // instancia del carrusel en el .data() de la instancia con la que se cargó el
  // plugin, así que un trigger lanzado desde la otra NO le llega: el handler se
  // ejecuta, no lanza error, y la flecha simplemente no hace nada. Ese era el
  // caso de las 14 flechas del tema.
  //
  // Por eso no basta el puente de $.fn.owlCarousel de loadOwlCarousel: ese
  // copia el plugin, pero el .data() sigue viviendo en la instancia original.
  // Aquí se busca cuál de las dos tiene de verdad ese carrusel.
  function owlTrigger(selector, evento) {
    var candidatas = [window.jQuery, window.$];

    for (var i = 0; i < candidatas.length; i++) {
      var jq = candidatas[i];
      if (!jq || !jq.fn) continue;

      try {
        var el = jq(selector);
        if (el.length && el.data('owl.carousel')) {
          el.trigger(evento);
          return true;
        }
      } catch (e) { /* instancia inservible: se prueba la siguiente */ }
    }

    // Ninguna lo tiene inicializado aún: se intenta igual con la de WordPress.
    try {
      (window.jQuery || window.$)(selector).trigger(evento);
    } catch (e) { /* nada más que hacer */ }
    return false;
  };

  function initComponents($) {
    // Función para manejar el sticky del header
    function initStickyHeader() {
      var $mainHeader = $('.main-header');
      var $subHeader = $('.site-content');
      
      if (!$mainHeader.length) {
        return;
      }
      
      // Marcador fijo en el flujo justo antes del header: su posición es la
      // del header "en reposo" aunque el header ya esté fixed, oculto o el
      // layout cambie después de cargar (fuentes, banners, barra de Safari).
      // Antes se guardaba un offset que podía quedar en 0 (header oculto /
      // layout sin terminar) y el header quedaba fixed encima del logo con
      // scroll 0 (visto en iPad Safari).
      var $anchor = $('<div class="main-header-anchor" aria-hidden="true" style="height:0;margin:0;padding:0;border:0"></div>');
      $mainHeader.before($anchor);

      function updateStickyHeader() {
        var scrollTop = $(window).scrollTop();
        if (!$mainHeader.is(':visible') && !$mainHeader.hasClass('sticky-header')) {
          return;
        }
        var anchorTop = $anchor.offset().top;
        var mainHeaderHeight = $mainHeader.outerHeight();

        if (scrollTop > 0 && scrollTop >= anchorTop) {
          if (!$mainHeader.hasClass('sticky-header')) {
            $mainHeader.addClass('sticky-header');
          }
          $subHeader.css('padding-top', mainHeaderHeight + 'px');
        } else if ($mainHeader.hasClass('sticky-header')) {
          $mainHeader.removeClass('sticky-header');
          $subHeader.css('padding-top', '');
        }
      }

      // Ejecutar al cargar (y otra vez cuando terminan fuentes/imágenes)
      setTimeout(updateStickyHeader, 100);
      $(window).on('load', updateStickyHeader);

      // Ejecutar en scroll
      $(window).on('scroll', updateStickyHeader);

      // Ejecutar en resize para recalcular alturas
      $(window).on('resize orientationchange', updateStickyHeader);
    }
    
    // Inicializar sticky header
    initStickyHeader();

    var btnAccordion = $('.accordion > .item-accordion > button');

    $(btnAccordion).click(function() {
      $(this).parent('.item-accordion').siblings('.item-accordion').find('.content').removeClass('max-h-screen duration-500').addClass('max-h-0 duration-300');
      $(this).parent('.item-accordion').siblings('.item-accordion').find('.accordion-icon').removeClass('rotate-180').addClass('rotate-0');
      $(this).siblings('.content').toggleClass('max-h-screen duration-500 max-h-0 duration-300');
      $(this).find('.accordion-icon').toggleClass('rotate-180 rotate-0');
    });

    $('.card-testimonies .show-more').click(function() {
      const $card = $(this).closest('.card-testimonies');
      const $column = $card.closest('.element-item');
      const $carousel = $card.closest('.owl-item');
      $column.siblings('.element-item').find('.card-testimonies').removeClass('is-expanded');
      $column.siblings('.element-item').find('.text-content').addClass('line-clamp-3');
      $column.siblings('.element-item').find('.img-testimonies').addClass('pt-[60%]');
      $column.siblings('.element-item').find('.show-more span').text('Ver más');
      $carousel.siblings('.owl-item').find('.card-testimonies').removeClass('is-expanded');
      $carousel.siblings('.owl-item').find('.text-content').addClass('line-clamp-3');
      $carousel.siblings('.owl-item').find('.img-testimonies').addClass('pt-[60%]');
      $carousel.siblings('.owl-item').find('.show-more span').text('Ver más');
      $card.toggleClass('is-expanded');
      $(this).toggleClass('absolute relative bottom-4 before:w-custom-34 ml-auto mt-custom-8');
      $(this).closest('.card-testimonies').find('.img-testimonies').toggleClass('pt-[60%]');
      $(this).closest('.card-testimonies').find('.text-content').toggleClass('line-clamp-3');
      $(this).find('span').text($card.hasClass('is-expanded') ? 'Ver menos' : 'Ver más');
    });

    var lg = $('.lightgallery');
    if(lg.length) {
      $(lg).lightGallery({
        selector: '.block-photos',
        mode: 'lg-tube',
        download: false,
        share: false,
        actualSize: false,
        enableTouch: false,
        thumbnail: false,
      });
    };

    // Función para detectar si es URL de YouTube
    function isYouTubeUrl(url) {
      if (!url) return false;
      var patterns = [
        /youtube\.com\/watch\?v=/,
        /youtu\.be\//,
        /youtube\.com\/embed\//,
        /youtube\.com\/v\//
      ];
      return patterns.some(function(pattern) {
        return pattern.test(url);
      });
    };

    // Función para convertir URL de YouTube a formato embed
    function getYouTubeEmbedUrl(url) {
      if (!url) return '';
      
      var videoId = '';
      var patterns = [
        { pattern: /youtube\.com\/watch\?v=([a-zA-Z0-9_-]+)/, index: 1 },
        { pattern: /youtu\.be\/([a-zA-Z0-9_-]+)/, index: 1 },
        { pattern: /youtube\.com\/embed\/([a-zA-Z0-9_-]+)/, index: 1 },
        { pattern: /youtube\.com\/v\/([a-zA-Z0-9_-]+)/, index: 1 }
      ];
      
      for (var i = 0; i < patterns.length; i++) {
        var match = url.match(patterns[i].pattern);
        if (match) {
          videoId = match[patterns[i].index];
          break;
        }
      }
      
      if (!videoId && /^[a-zA-Z0-9_-]+$/.test(url.trim())) {
        videoId = url.trim();
      }
      
      if (videoId) {
        return 'https://www.youtube.com/embed/' + videoId + '?autoplay=1&rel=0';
      }
      
      return '';
    };

    $('.play-custom-video').click(function() {
      $('body').addClass('overflow-hidden');
      var $clickedElement = $(this);
      var videoUrl = $clickedElement.attr('data-custom-video');
      
      // Buscar el modal más cercano al elemento clicado
      // Primero intentar encontrar un modal en el mismo contenedor padre
      var $container = $clickedElement.closest('section, main, article, .container, body').find('.gallery-custom-video').first();
      
      // Si no se encuentra, buscar el más cercano en el DOM
      if ($container.length === 0) {
        // Obtener la posición del elemento clicado
        var clickedOffset = $clickedElement.offset();
        var minDistance = Infinity;
        var closestModal = null;
        
        $('.gallery-custom-video').each(function() {
          var $modal = $(this);
          var modalOffset = $modal.offset();
          var distance = Math.abs(clickedOffset.top - modalOffset.top) + Math.abs(clickedOffset.left - modalOffset.left);
          
          if (distance < minDistance) {
            minDistance = distance;
            closestModal = $modal;
          }
        });
        
        $container = closestModal || $('.gallery-custom-video').first();
      }
      
      // Abrir solo el modal encontrado
      $container.removeClass('top-full invisible opacity-0').addClass('top-0');
      
      // Buscar video, iframe y wrapper dentro del modal específico (puede tener diferentes IDs)
      var $video = $container.find('video[id^="video-cover"]');
      var $iframe = $container.find('iframe[id^="youtube-iframe"]');
      var $iframeWrapper = $container.find('.iframe-wrapper');
      
      // Detectar si es YouTube
      if (isYouTubeUrl(videoUrl)) {
        // Ocultar video HTML5 y mostrar iframe de YouTube (y su wrapper)
        $video.hide();
        $iframeWrapper.removeClass('hidden').show();
        var embedUrl = getYouTubeEmbedUrl(videoUrl);
        $iframe.attr('src', embedUrl).removeClass('hidden').show();
      } else {
        // Es video HTML5: ocultar iframe y su wrapper, mostrar video
        $iframeWrapper.addClass('hidden').hide();
        $iframe.addClass('hidden').hide().attr('src', '');
        $video.show();
        var $source = $video.find('source');
        $source.attr('src', videoUrl);
        $video[0].load();
        $video[0].play();
      }
    });

    $('.close-custom-video').click(function() {
      var $button = $(this);
      // Encontrar el modal padre del botón
      var $container = $button.closest('.gallery-custom-video');
      
      $container.removeClass('top-0').addClass('top-full invisible opacity-0');
      var $video = $container.find('video[id^="video-cover"]');
      var $iframe = $container.find('iframe[id^="youtube-iframe"]');
      var $iframeWrapper = $container.find('.iframe-wrapper');
      var $source = $video.find('source');
      $('body').removeClass('overflow-hidden');
      
      // Ocultar wrapper del iframe al cerrar
      $iframeWrapper.addClass('hidden').hide();
      
      // Pausar video HTML5 si está visible
      if ($video.is(':visible')) {
        $video[0].pause();
        $video[0].currentTime = 0;
        $source.removeAttr('src');
        $video[0].load();
      }
      
      // Detener iframe de YouTube si está visible
      if ($iframe.is(':visible')) {
        $iframe.attr('src', '').addClass('hidden').hide();
      }
    });

    if($(window).width() <= 767 && $('.single-product').length) {
      var cart = $('.summary .cart');
      var cartHeight = cart.outerHeight(true);
      var altura = $('.summary').offset().top + (cartHeight * 3);
      $(window).on('scroll', function() {
        if($(window).scrollTop() > altura) {
          $('.summary').addClass('action-product-fixed');
          $('.summary').css('padding-top', cartHeight + 'px');
        } else {
          $('.summary').removeClass('action-product-fixed');
          $('.summary').css('padding-top', '');
        }
      });
    };

    function formatDateTime() {
      const date = new Date();
      const year = date.getFullYear();
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      const day = date.getDate().toString().padStart(2, '0');
      const hours = date.getHours().toString().padStart(2, '0');
      const minutes = date.getMinutes().toString().padStart(2, '0');
      return `${year}-${month}-${day} ${hours}:${minutes}`;
    };

    function getUTMParams() {
      const urlParams = new URLSearchParams(window.location.search);
      const utms = [];
      for (const [key, value] of urlParams.entries()) {
        if (key.startsWith('utm_') || key.startsWith('hsa_') || key.startsWith('ctf_') || key === 'gclid' || key === 'gad_source') {
          utms.push(`${key}=${value}`);
        }
      }
      return utms.join('&');
    };

    if($('.calendar-appointment').length) {
      var currentDate = new Date().toISOString().split('T')[0];
      let addToCartButton = $('.single_add_to_cart_button');
      initCalendar();
      function initCalendar(disabledWeekdays = [0, 1]) {
        const currentDate = new Date().toISOString().split('T')[0];
        $('#dd').pignoseCalendar('destroy');
        $('#dd').pignoseCalendar({
          format: 'YYYY-MM-DD',
          disabledDates: [currentDate, "2025-04-17", "2025-04-18", "2025-04-19", "2025-04-17","2025-04-18","2025-04-26","2025-05-01", "2025-06-02","2025-06-23","2025-06-30","2025-07-20", "2025-08-07","2025-08-18","2025-10-13","2025-11-03", "2025-11-17","2025-12-08","2025-12-25"],
          disabledWeekdays: disabledWeekdays,
          minDate: currentDate,
          week: 1,
          lang: 'es',
          select: onSelectHandler
        });
        const warning = $('.warning-calendar-appointment');
        $('#hoursSelect').attr('disabled', true);
        warning?.addClass('hidden').removeClass('block').text('');
      };
      function isBetween1230And1500(timeString) {
        const [hour, minute] = timeString.split(':').map(Number);
        const totalMinutes = hour * 60 + minute;
        const start = 13 * 60;
        const end = 17 * 60;
        return totalMinutes >= start && totalMinutes <= end;
      };
      function formatTo12Hour(timeString) {
        let [hour, minute] = timeString.split(':').map(num => parseInt(num, 10));
        let suffix = hour >= 12 ? 'pm' : 'am';
        if (hour === 0) {
          hour = 12;
        } else if (hour > 12) {
          hour = hour - 12;
        }
        minute = minute.toString().padStart(2, '0');
        return `${hour}:${minute} ${suffix}`;
      };
      let availableSlots = [];
      function populateHoursSelect() {
        const modality = document.getElementById('modalitySelect').value;
        const hoursSelect = document.getElementById('hoursSelect');
        const warning = $('.warning-calendar-appointment');
        const selectedDate = $('#date_appointment').val();
        hoursSelect.innerHTML = '<option value="" class="hidden">Selecciona</option>';
        hoursSelect.setAttribute('disabled', true);
        warning.addClass('hidden').removeClass('block').text('');
        if(!selectedDate) {
          return;
        }
        let filteredSlots = [...availableSlots];
        if(modality === 'telemedicina') {
          filteredSlots = filteredSlots.filter(isBetween1230And1500);
        }
        if(filteredSlots.length === 0) {
          const noOption = document.createElement('option');
          noOption.value = '';
          noOption.textContent = 'Sin horarios disponibles';
          hoursSelect.appendChild(noOption);
          warning.removeClass('hidden').addClass('block').text('No hay horarios disponibles para esta fecha');
          return;
        }
        hoursSelect.removeAttribute('disabled');
        filteredSlots.forEach(hora24 => {
          const option = document.createElement('option');
          option.value = hora24;
          option.textContent = formatTo12Hour(hora24);
          hoursSelect.appendChild(option);
        });
      };
      document.getElementById('modalitySelect').addEventListener('change', function () {
        const value = this.value;
        if(value === 'telemedicina') {
          initCalendar([0, 1, 6]);
        } else {
          initCalendar([0, 1]);
        }
        if(value) {
          $('#dd').removeClass('disabled');
        }
        $('#date_appointment').val('');
        populateHoursSelect();
      });
      function onSelectHandler(date) {
        let fecha = '';
        if(date[0] !== null) {
          fecha = date[0].format('YYYY-MM-DD');
          $('.loading-calendar-appointment').removeClass('invisible opacity-0 -z-50').addClass('visible opacity-100 z-50');
          fetch('https://external.rogansya.com/externals-api.php?action=available-dots&day=' + fecha)
            .then(function (response) {
              if (!response.ok) {
                throw new Error('Error en la respuesta de la API');
              }
              return response.text();
            })
            .then(function (text) {
              if (!text || text.trim() === '') {
                availableSlots = [];
                $('.warning-calendar-appointment').removeClass('hidden').addClass('block').text('No hay horarios disponibles para esta fecha');
                $('#date_appointment').val(fecha);
                const hoursSelect = document.getElementById('hoursSelect');
                hoursSelect.innerHTML = '<option value="" class="hidden">Selecciona</option>';
                hoursSelect.setAttribute('disabled', true);
                $('.loading-calendar-appointment').removeClass('visible opacity-100 z-50').addClass('invisible opacity-0 -z-50');
                validateForm();
                return;
              }
              let data;
              try {
                data = JSON.parse(text);
              } catch (e) {
                console.error('Error al parsear JSON:', e, text);
                throw new Error('Respuesta inválida del servidor');
              }
              const slots = data;
              $('.warning-calendar-appointment').addClass('hidden').removeClass('block').text('');
              if (Array.isArray(slots) && slots.length > 0) {
                const toMinutes = (time) => {
                  const [h, m] = time.split(':').map(Number);
                  return h * 60 + m;
                };
                const toTimeStr = (mins) => {
                  const h = String(Math.floor(mins / 60)).padStart(2, '0');
                  const m = String(mins % 60).padStart(2, '0');
                  return `${h}:${m}`;
                };
                availableSlots = slots;
                $('#date_appointment').val(fecha);
                document.getElementById('modalitySelect').removeAttribute('disabled');
                $('.loading-calendar-appointment').removeClass('visible opacity-100 z-50').addClass('invisible opacity-0 -z-50');
                populateHoursSelect();
                validateForm();
              } else {
                availableSlots = [];
                $('#date_appointment').val(fecha);
                document.getElementById('modalitySelect').setAttribute('disabled', 'true');
                const hoursSelect = document.getElementById('hoursSelect');
                hoursSelect.innerHTML = '<option value="" class="hidden">Selecciona</option>';
                hoursSelect.setAttribute('disabled', true);
                $('.loading-calendar-appointment')
                  .removeClass('visible opacity-100 z-50')
                  .addClass('invisible opacity-0 -z-50');
                validateForm();
              }
            })
            .catch(function (error) {
              console.error('Error en el fetch:', error);
              $('.loading-calendar-appointment').removeClass('visible opacity-100 z-50').addClass('invisible opacity-0 -z-50');
            });
        } else {
          const hoursSelect = document.getElementById('hoursSelect');
          hoursSelect.innerHTML = '<option value="" class="hidden">Selecciona</option>';
          hoursSelect.setAttribute('disabled', true);
          validateForm();
        }
      };
      setTimeout(() => {
        variationContainer.addClass('woocommerce-variation-add-to-cart-disabled');
      }, 1000);
      const submitButton = $('.submit-appointment-wp');
      const variationContainer = $('.woocommerce-variation-add-to-cart');
      submitButton.attr('disabled', true);
      const type = $('#product_type').length ? $('#product_type').val() || '' : '';
      const category = $('#product_category').length ? $('#product_category').val() || '' : '';
      const productName = $('#product_name').val();
      const productId = $('#product_id').val();
      variationContainer.addClass('woocommerce-variation-add-to-cart-disabled');
      function validateForm() {
        let isFormValid = true;
        const name = $('#nameAppointment').length ? $('#nameAppointment').val() || '' : '';
        const phone = $('#phoneAppointment').length ? $('#phoneAppointment').val() || '' : '';
        const modality = $('#modalitySelect').val();
        const hour = $('#hoursSelect').val();
        if(type === 'variable') {
          const variationId = $('input.variation_id').val();
          if (!variationId || !name || !phone || !modality || !hour) {
            isFormValid = false;
          }
        } else {
          if (!name || !phone || !modality || !hour) {
            isFormValid = false;
          }
        }
        if(isFormValid) {
          submitButton.removeAttr('disabled');
          variationContainer.removeClass('woocommerce-variation-add-to-cart-disabled');
        } else {
          submitButton.attr('disabled', true);
          variationContainer.addClass('woocommerce-variation-add-to-cart-disabled');
        }
      };
      $('#nameAppointment').on('input', validateForm);
      $('#phoneAppointment').on('input', validateForm);
      $('#modalitySelect').on('change', validateForm);
      $('#hoursSelect').on('change', validateForm);
      $('#date_appointment').on('input', validateForm);
      $('input.variation_id').on('change', validateForm);
      $('#form-calendar-appointment').on('submit', function(e) {
        e.preventDefault();
        const name = $('#nameAppointment').val().trim();
        const indicativePhone = $('#indicativePhone').val();
        const phone = $('#phoneAppointment').val().trim();
        const modality = $('#modalitySelect').val();
        const hour = $('#hoursSelect').val();
        const date = $('#date_appointment').val();
        const variationId = $('input.variation_id').val();
        const agendamientoData = {
          telefono: indicativePhone + phone,
          tipo: 'Consulta médica por magistral: ' + productName,
          modalidad: modality,
          linea_medica: category,
          fecha_cita: date + ' ' + hour,
          fecha_agendamiento: formatDateTime(),
          estado: 'agendada',
        };
        const agendamientoExcel = {
          nombre: name,
          telefono: indicativePhone + phone,
          correo: '',
          evento_agendado: `Agendamiento de consulta ${modality} desde producto magistral "${productName}" (${formatDateTime()})`,
          fecha: date + ' | ' + hour,
          notas: ``,
        };
        if(type === 'variable') {
          if(name && phone && indicativePhone && modality && hour && date && variationId) {
            scheduleDB(agendamientoData, agendamientoExcel, variationId);
          } else {
            alert('Por favor, completa todos los campos.');
          }
        } else {
          if(name && phone && indicativePhone && modality && hour && date) {
            scheduleDB(agendamientoData, agendamientoExcel);
          } else {
            alert('Por favor, completa todos los campos.');
          }
        }
      });
      function scheduleDB(agendamientoData, agendamientoExcel, product) {
        $.ajax({
          url: 'https://roganscare.com/app-api/index.php/citas',
          method: 'POST',
          contentType: 'application/json',
          data: JSON.stringify(agendamientoData),
          success: function(data) {
            scheduleExcel(agendamientoExcel);
            setTimeout(() => {
              let cartUrl = `${URL_WEB}/carrito/?add-to-cart=${type === 'variable' ? product : productId}&quantity=1`;
              window.location.href = cartUrl;
            }, 1000);
          },
          error: function(jqXHR, textStatus, errorThrown) {
            console.error('Error:', errorThrown);
            alert('Hubo un error al agendar la cita');
          }
        });
      };
      function scheduleExcel(agendamientoExcel) {
        $.ajax({
          url: 'https://rogansya.com/rogans-app/agendamiento-web.php?accion=agendar',
          method: 'POST',
          contentType: 'application/json',
          data: JSON.stringify(agendamientoExcel),
          success: function(data) {
          },
          error: function(jqXHR, textStatus, errorThrown) {
            console.error('Error:', errorThrown);
            alert('Hubo un error al agendar la cita');
          }
        });
      };
    };

    let targetNode = document.querySelector('input.variation_id');
    let variationContainer = $('.woocommerce-variation-add-to-cart');

    if(targetNode && !$('.calendar-appointment').length) {
      let addToCartButton = $('.single_add_to_cart_button');
      variationContainer.addClass('woocommerce-variation-add-to-cart-disabled');
      let observer = new MutationObserver(function (mutationsList) {
        mutationsList.forEach(function (mutation) {
          if (mutation.type === "attributes" && mutation.attributeName === "value") {
            let variationId = $(targetNode).val();
            if (variationId) {
              addToCartButton.attr('value', variationId);
              let cartUrl = addToCartButton.attr('href');
              if (cartUrl) {
                let newCartUrl = URL_WEB + '/carrito?add-to-cart=' + variationId + '&quantity=1';
                addToCartButton.attr('href', newCartUrl);
              }
            }
          }
        });
      });
      observer.observe(targetNode, { attributes: true });
    };

    if($('.sidebar-appointment').length) {
      var currentDate = new Date().toISOString().split('T')[0];
      const submitButton = $('.submit-appointment-sidebar');
      const prohibidas = [0, 1];
      $('#gg').pignoseCalendar({
        format: 'YYYY-MM-DD',
        disabledDates: [currentDate, "2025-04-17", "2025-04-18", "2025-04-19", "2025-04-17","2025-04-18","2025-04-26","2025-05-01", "2025-06-02","2025-06-23","2025-06-30","2025-07-20", "2025-08-07","2025-08-18","2025-10-13","2025-11-03", "2025-11-17","2025-12-08","2025-12-25"],
        disabledWeekdays: prohibidas,
        minDate: currentDate,
        week: 1,
        lang: 'es',
        select: onSelectHandlerSidebar
      });

      function isBetween1230And1500(timeString) {
        const [hour, minute] = timeString.split(':').map(Number);
        const totalMinutes = hour * 60 + minute;
        const start = 13 * 60;
        const end = 17 * 60;
        return totalMinutes >= start && totalMinutes <= end;
      };

      function isBetweenNutrition(timeString) {
        const [hour, minute] = timeString.split(':').map(Number);
        const totalMinutes = hour * 60 + minute;
        const start = 9 * 60;
        const end = 11 * 60 + 30;
        return totalMinutes >= start && totalMinutes <= end;
      };

      function formatTo12Hour(timeString) {
        let [hour, minute] = timeString.split(':').map(num => parseInt(num, 10));
        let suffix = hour >= 12 ? 'pm' : 'am';
        if (hour === 0) {
          hour = 12;
        } else if (hour > 12) {
          hour = hour - 12;
        }
        minute = minute.toString().padStart(2, '0');
        return `${hour}:${minute} ${suffix}`;
      };

      let availableSlots = [];
      function populateHoursSelect() {
        const modality = document.getElementById('modalitySelect').value;
        const hoursSelect = document.getElementById('hoursSelect');
        const warning = document.querySelector('.warning-calendar-appointment');
        hoursSelect.innerHTML = '';
        const defaultOption = document.createElement('option');
        defaultOption.value = '';
        defaultOption.textContent = 'Selecciona';
        defaultOption.classList.add('hidden');
        hoursSelect.appendChild(defaultOption);
        let filteredSlots = [...availableSlots];
        if (modality === 'telemedicina') {
          filteredSlots = filteredSlots.filter(isBetween1230And1500);
        }
        if (filteredSlots.length === 0) {
          const noOption = document.createElement('option');
          noOption.value = '';
          noOption.textContent = 'Sin horarios disponibles';
          hoursSelect.appendChild(noOption);
          hoursSelect.setAttribute('disabled', true);
          warning?.classList.remove('hidden');
          return;
        }
        warning?.classList.add('hidden');
        hoursSelect.removeAttribute('disabled');
        filteredSlots.forEach(hora24 => {
          const option = document.createElement('option');
          option.value = hora24;
          option.textContent = formatTo12Hour(hora24);
          hoursSelect.appendChild(option);
        });
      };

      document.getElementById('modalitySelect').addEventListener('change', function () {
        if(document.getElementById('modalitySelect').value) {
          document.getElementById('hoursSelect').removeAttribute('disabled');
        }
        populateHoursSelect();
      });

      $('#modalitySelect').on('change', function () {
        populateHoursSelect();
        validateForm();
      });

      function onSelectHandlerSidebar(date) {
        var fecha = '';
        if(date[0] !== null) {
          fecha += date[0].format('YYYY-MM-DD');
          const selectedDate = new Date(fecha);
          const dayOfWeek = selectedDate.getDay();
          const modalitySelect = document.getElementById('modalitySelect');
          const teleOption = modalitySelect.querySelector('option[value="telemedicina"]');
          if (dayOfWeek === 5) {
            teleOption.disabled = true;
            modalitySelect.value = 'presencial';
          } else {
            teleOption.disabled = false;
            modalitySelect.value = '';
          }
          $('.loading-calendar-appointment').removeClass('invisible opacity-0 -z-50').addClass('visible opacity-100 z-50');
          fetch('https://rogansya.com/rogans-app/agendamiento-web.php?accion=available-dots&day=' + fecha)
            .then(function (response) {
              if (!response.ok) {
                throw new Error('Error en la respuesta de la API');
              }
              return response.json();
            })
            .then(function (data) {
              const slots = data;
              if(!Array.isArray(slots) || slots.length === 0) {
                availableSlots = [];
                $('#hoursSelect').html('<option value="" class="hidden">Sin horarios disponibles</option>').attr('disabled', true);
                return;
              }
              const toMinutes = (time) => {
                const [h, m] = time.split(':').map(Number);
                return h * 60 + m;
              };
              const toTimeStr = (mins) => {
                const h = String(Math.floor(mins / 60)).padStart(2, '0');
                const m = String(mins % 60).padStart(2, '0');
                return `${h}:${m}`;
              };
              const minStart = toMinutes(slots[0]);
              const maxEnd = toMinutes(slots[slots.length - 1]);
              const result = [];
              for (let t = minStart; t <= maxEnd; t += 15) {
                result.push(toTimeStr(t));
              }
              availableSlots = result;
              $('#date_appointment').val(fecha);
              document.getElementById('modalitySelect').removeAttribute('disabled');
              $('.loading-calendar-appointment').removeClass('visible opacity-100 z-50').addClass('invisible opacity-0 -z-50');
              populateHoursSelect();
              validateForm();
            })
            .catch(function (error) {
              console.error('Error en el fetch:', error);
            });
        } else {
          document.getElementById('modalitySelect').setAttribute('disabled', 'true');
          const hoursSelect = document.getElementById('hoursSelect');
          hoursSelect.innerHTML = '<option value="" class="hidden">Selecciona</option>';
          hoursSelect.setAttribute('disabled', true);
          validateForm();
        }
      };

      function validateForm() {
        let isFormValid = true;
        const name = $('#nameAppointment').length ? $('#nameAppointment').val() || '' : '';
        const phone = $('#phoneAppointment').length ? $('#phoneAppointment').val() || '' : '';
        const modality = $('#modalitySelect').val();
        const hour = $('#hoursSelect').val();
        if (!name || !phone || !modality || !hour) {
          isFormValid = false;
        }
        if(isFormValid) {
          submitButton.removeAttr('disabled');
        } else {
          submitButton.attr('disabled', true);
        }
      };

      $('#nameAppointment').on('input', validateForm);
      $('#phoneAppointment').on('input', validateForm);
      $('#modalitySelect').on('change', validateForm);
      $('#hoursSelect').on('change', validateForm);
      $('#date_appointment').on('input', validateForm);

      $('#form-schedule-sidebar').on('submit', function(e) {
        e.preventDefault();
        const name = $('#nameAppointment').val().trim();
        const indicativePhone = $('#indicativePhone').val();
        const phone = $('#phoneAppointment').val().trim();
        const modality = $('#modalitySelect').val();
        const hour = $('#hoursSelect').val();
        const date = $('#date_appointment').val();
        var agendamientoExcel = {};
        const agendamientoData = {
          telefono: indicativePhone + phone,
          tipo: 'Consulta médica de Pérdida de Peso',
          modalidad: modality,
          linea_medica: 'Nutrición',
          fecha_cita: date + ' ' + hour,
          fecha_agendamiento: formatDateTime(),
          estado: 'agendada',
        };
        if(ID_PAGE === '571' || ID_PAGE === '451' || ID_PAGE === '425' || ID_PAGE === '651' || ID_PAGE === '701') {
          var respuestasGuardadas = localStorage.getItem('respuestasFormularioPerdidaPeso');
          const respuestasObj = JSON.parse(respuestasGuardadas);
          const respuestasLegibles = 
          `Altura: ${respuestasObj.altura}
          ` +
          `Peso: ${respuestasObj.peso}
          ` +
          `Sexo: ${respuestasObj.sexo}
          ` +
          `Visita al médico: ${respuestasObj.visita_medico}
          ` +
          `Objetivo: ${respuestasObj.objetivo?.join(', ') || ''}
          ` +
          `Cardio: ${respuestasObj.cardio?.join(', ') || ''}
          ` +
          `Hormonal: ${respuestasObj.hormonal?.join(', ') || ''}
          ` +
          `IMC: ${respuestasObj.imc}
          `;
          agendamientoExcel = {
            respuestas: respuestasLegibles ? respuestasLegibles : '',
            viabilidad: respuestasObj.es_viable ? 'Si' : 'No',
            nombre: name,
            telefono: indicativePhone + phone,
            fecha: date,
            modalidad: modality + ` (${formatDateTime()})`,
            hora: hour,
            utm: getUTMParams(),
          };
        } else {
          agendamientoExcel = {
            nombre: name,
            telefono: indicativePhone + phone,
            correo: '',
            evento_agendado: `Agendamiento de consulta ${modality} de Pérdida de Peso (${formatDateTime()})`,
            fecha: date + ' | ' + hour,
            notas: ``,
            utm: getUTMParams(),
          };
        }
        if(name && phone && indicativePhone && modality && hour && date) {
          scheduleDB(agendamientoData, agendamientoExcel);
        } else {
          alert('Por favor, completa todos los campos.');
        }
      });

      function scheduleDB(agendamientoData, agendamientoExcel, product) {
        $('.loading-calendar-appointment').removeClass('invisible opacity-0 -z-50').addClass('visible opacity-100 z-50');
        $.ajax({
          url: 'https://roganscare.com/app-api/index.php/citas',
          method: 'POST',
          contentType: 'application/json',
          data: JSON.stringify(agendamientoData),
          success: function(data) {
            scheduleExcel(agendamientoExcel);
            setTimeout(() => {
              $('#form-schedule-sidebar').addClass('hidden');
              $('.success-appointment').removeClass('hidden');
              $('.loading-calendar-appointment').addClass('invisible opacity-0 -z-50').removeClass('visible opacity-100 z-50');
              setTimeout(() => {
                $('#form-schedule-sidebar').addClass('hidden');
                $('.success-appointment').removeClass('hidden');
                $('.dialog-calendar').addClass('opacity-0 invisible -translate-x-full');
                $('.overlay-dialog-calendar').removeClass('z-[9999999]').addClass('opacity-0 invisible -z-[100000]');
                $('body').removeClass('overflow-y-hidden');
              }, 3000);
            }, 1000);
          },
          error: function(jqXHR, textStatus, errorThrown) {
            console.error('Error:', errorThrown);
            alert('Hubo un error al agendar la cita');
          }
        });
      };

      function scheduleExcel(agendamientoExcel) {
        if(ID_PAGE === '571' || ID_PAGE === '451' || ID_PAGE === '425' || ID_PAGE === '651' || ID_PAGE === '701') {
          $.ajax({
            url: 'https://rogansya.com/rogans-app/agendamiento-web.php?accion=nutricion',
            method: 'POST',
            contentType: 'application/json',
            data: JSON.stringify(agendamientoExcel),
            success: function(data) {
            },
            error: function(jqXHR, textStatus, errorThrown) {
              console.error('Error:', errorThrown);
              alert('Hubo un error al agendar la cita');
            }
          });
        } else {
          $.ajax({
            url: 'https://rogansya.com/rogans-app/agendamiento-web.php?accion=agendar',
            method: 'POST',
            contentType: 'application/json',
            data: JSON.stringify(agendamientoExcel),
            success: function(data) {
            },
            error: function(jqXHR, textStatus, errorThrown) {
              console.error('Error:', errorThrown);
              alert('Hubo un error al agendar la cita');
            }
          });
        }
      };
    };

    if($('.toggle-sidebar-appointment').length) {
      $('.toggle-sidebar-appointment').click(function() {
        const calendar = $('.dialog-calendar');
        if(calendar.hasClass('-translate-x-full')) {
          $('body').addClass('overflow-y-hidden');
          calendar.removeClass('opacity-0 invisible -translate-x-full').addClass('opacity-100 visible');
          $('.overlay-dialog-calendar').removeClass('opacity-0 invisible -z-[100000]').addClass('z-[9999999]');
        } else {
          $('body').removeClass('overflow-y-hidden');
          calendar.removeClass('opacity-100 visible').addClass('opacity-0 invisible -translate-x-full');
          $('.overlay-dialog-calendar').removeClass('z-[9999999]').addClass('opacity-0 invisible -z-[100000]');
        }
      });
    };

    if ($('.custom-tabs').length) {
      $('.custom-tabs button').click(function() {
        var tabId = $(this).data('tab');
        $('.tab-panel').removeClass('active animate__fadeIn');
        $('#' + tabId).addClass('active animate__fadeIn');
        $('.custom-tabs button').removeClass('active');
        $(this).addClass('active');
      });
    };

    if($('.counter').length) {
      function animateCounter(counter) {
        const target = +$(counter).data('target');
        const duration = 2000;
        const start = 0;
        let startTimestamp = null;
        function step(timestamp) {
          if (!startTimestamp) startTimestamp = timestamp;
          const progress = Math.min((timestamp - startTimestamp) / duration, 1);
          const value = Math.floor(progress * (target - start) + start);
          $(counter).text('+' + value.toLocaleString());
          if (progress < 1) {
            window.requestAnimationFrame(step);
          } else {
            $(counter).text('+' + target.toLocaleString());
          }
        }
        window.requestAnimationFrame(step);
      }
      let started = false;
      function handleScrollCounters() {
        const section = $('#counter-section');
        if (!section.length) return;
        function onScroll() {
          const rect = section[0].getBoundingClientRect();
          if (!started && rect.top < window.innerHeight && rect.bottom > 0) {
            $('.counter').each(function () {
              animateCounter(this);
            });
            started = true;
            $(window).off('scroll', onScroll);
          }
        }
        $(window).on('scroll', onScroll);
        onScroll();
      }
      handleScrollCounters();
    };

    if($('#form-formulas-medicas').length) {
      const serviceSelect = $('#service');
      const formulaUpload = $('#formula-upload');
      const fileInput = $('#formula_file');
      const fileName = $('#file-name');
      const nextButton = $('.next-step-submit');
      const loadingForm = $('.loading-form-sent');
      const step3 = $('#form-formulas-medicas-step3');
      serviceSelect.on('change', function() {
        if($(this).val() === 'fórmula-medica') {
          formulaUpload.removeClass('hidden');
        } else {
          formulaUpload.addClass('hidden');
          fileInput.val('');
          fileName.addClass('hidden');
        }
        validateStep1();
      });
      fileInput.on('change', function() {
        if(this.files && this.files[0]) {
          const file = this.files[0];
          if(file.size > 10 * 1024 * 1024) {
            alert('El archivo es demasiado grande. El tamaño máximo permitido es 10MB.');
            this.value = '';
            fileName.addClass('hidden');
          } else {
            fileName.find('span').text(file.name);
            fileName.removeClass('hidden');
          }
        }
        validateStep1();
      });
      $('#remove-file').on('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        fileInput.val('');
        fileName.addClass('hidden');
        validateStep1();
      });
      function validateStep1() {
        const phoneValue = $('#phoneAppointment').length ? $('#phoneAppointment').val() || '' : '';
        const namesValue = $('#names').length ? $('#names').val() || '' : '';
        const documentValue = $('#document').length ? $('#document').val() || '' : '';
        const serviceValue = $('#service').length ? $('#service').val() || '' : '';
        const termsChecked = $('#terms_conditions').length ? $('#terms_conditions').is(':checked') : false;
        const termsError = $('#terms_error');
        const fileInputExists = fileInput.length ? fileInput[0] : null;
        if (!termsChecked) {
          termsError.removeClass('hidden');
        } else {
          termsError.addClass('hidden');
        }
        let isValid = phoneValue && namesValue && documentValue && serviceValue && termsChecked;
        if(serviceValue === 'fórmula-medica') {
          isValid = isValid && fileInputExists && fileInputExists.files.length > 0;
        }
        nextButton.prop('disabled', !isValid);
      }
      $('#phoneAppointment, #names, #document').on('input', validateStep1);
      serviceSelect.on('change', validateStep1);
      $('#terms_conditions').on('change', validateStep1);
      nextButton.on('click', function(e) {
        e.preventDefault();
        if (!nextButton.prop('disabled')) {
          loadingForm.removeClass('hidden').addClass('flex');
          setTimeout(() => {
            loadingForm.addClass('hidden').removeClass('flex');
            $('#form-formulas-medicas-step1').addClass('hidden');
            $('#form-formulas-medicas-step3').removeClass('hidden');
            smoothScrollToElement('div-form-formulas-medicas');
          }, 2000);
        }
      });
      validateStep1();
    };

    function smoothScrollToElement(elementId, intentos = 10) {
      const intentarScroll = (retries) => {
        const element = document.getElementById(elementId);
        if (element && $(element).is(':visible')) {
          const headerOffset = 100;
          const elementPosition = element.getBoundingClientRect().top;
          const offsetPosition = elementPosition + window.pageYOffset - headerOffset;
          window.scrollTo({
            top: offsetPosition,
            behavior: 'smooth'
          });
        } else if (retries > 0) {
          setTimeout(() => intentarScroll(retries - 1), 100);
        } else {
          console.warn('No se encontró el destino para hacer scroll:', elementId);
        }
      };
      intentarScroll(intentos);
    };

    $(document).on('click', '[data-scroll-to]', function(e) {
      e.preventDefault();
      const targetId = $(this).data('scroll-to');
      smoothScrollToElement(targetId);
    });

    // Inicializar calendario Diagnóstico Capilar
    if($('#calendar-sidebar-diagnosis').length) {
      // Hacer la función accesible globalmente
      window.initCalendarDiagnosis = function(disabledWeekdays = [0, 1]) {
        // Verificar que la librería esté disponible - doble verificación
        if(typeof $ === 'undefined' || typeof $.fn === 'undefined' || typeof $.fn.pignoseCalendar !== "function") {
          console.warn('pignoseCalendar no está disponible aún');
          return false;
        }
        
        const $calendar = $('#calendar-sidebar-diagnosis');
        if(!$calendar.length) {
          return false;
        }
        
        const currentDate = new Date().toISOString().split('T')[0];
        
        // Calcular la fecha del día anterior en la zona horaria de Bogotá
        function getPreviousDayBogota() {
          // Obtener la fecha actual en la zona horaria de Bogotá
          const now = new Date();
          const bogotaDate = new Date(now.toLocaleString("en-US", {timeZone: "America/Bogota"}));
          
          // Restar un día
          bogotaDate.setDate(bogotaDate.getDate() - 1);
          
          // Formatear como YYYY-MM-DD
          const year = bogotaDate.getFullYear();
          const month = String(bogotaDate.getMonth() + 1).padStart(2, '0');
          const day = String(bogotaDate.getDate()).padStart(2, '0');
          
          return `${year}-${month}-${day}`;
        }
        
        const previousDayBogota = getPreviousDayBogota();
    
        // Verificar si el calendario ya existe antes de destruirlo
        if($calendar.data('pignoseCalendar')) {
          try {
            $calendar.pignoseCalendar('destroy');
          } catch(e) {
            console.warn('Error al destruir calendario:', e);
          }
        }
    
        try {
          $calendar.pignoseCalendar({
            date: previousDayBogota,
            format: 'YYYY-MM-DD',
            disabledDates: ["2025-04-17", "2025-04-18", "2025-04-19", "2025-04-17","2025-04-18","2025-04-26","2025-05-01", "2025-06-02","2025-06-23","2025-06-30","2025-07-20", "2025-08-07","2025-08-18","2025-10-13","2025-11-03", "2025-11-17","2025-12-08", "2025-12-24", "2025-12-25", "2025-12-31", "2026-01-01", "2026-04-02", "2026-04-03", "2026-04-04", "2026-05-01", "2026-08-07", "2026-12-25"],
            disabledWeekdays: disabledWeekdays,
            minDate: currentDate,
            week: 1,
            lang: 'es',
            select: onSelectDateCalendar
          });
          return true;
        } catch(e) {
          console.error('Error al inicializar pignoseCalendar:', e);
          return false;
        }
      };
      
      // Función helper para inicializar el calendario (siempre se inicializa, con disabled si no hay modalidad)
      window.tryInitCalendarDiagnosis = function() {
        const $calendar = $('#calendar-sidebar-diagnosis');
        
        // Verificar si el calendario ya está inicializado
        if($calendar.data('pignoseCalendar')) {
          // Ya está inicializado, solo actualizar el estado de disabled según la modalidad
          const $modalitySelect = $('#modalityAppointment');
          const selectedModality = $modalitySelect.length ? $modalitySelect.val() : '';
          if (!selectedModality || selectedModality === '') {
            $calendar.addClass('disabled');
          } else {
            $calendar.removeClass('disabled');
          }
          return true;
        }
        
        // Verificar que la librería esté disponible antes de inicializar
        if(typeof $.fn.pignoseCalendar !== "function") {
          return false;
        }
        
        // Detectar modalidad seleccionada para inicializar calendario correctamente
        const $modalitySelect = $('#modalityAppointment');
        const selectedModality = $modalitySelect.length ? $modalitySelect.val() : '';
        const isPsicologia = String(window.calendarDiagnosisSpecialty || '').toLowerCase() === 'sesion psicologia';
        const daysForMode = isPsicologia
          ? [0, 6]
          : (selectedModality === 'telemedicina' ? [0, 1, 6] : [0, 1]);
        const initResult = window.initCalendarDiagnosis(daysForMode);
        if(!initResult) {
          // No se pudo inicializar
          return false;
        }
        
        // Verificar si hay modalidad seleccionada para quitar/agregar disabled
        if (!selectedModality || selectedModality === '') {
          // No hay modalidad seleccionada, asegurar que el calendario tenga disabled
          $calendar.addClass('disabled');
        } else {
          // Hay modalidad seleccionada, quitar disabled
          $calendar.removeClass('disabled');
        }
        
        return true;
      };
      
      // Listener para cuando se abra el sidebar-diagnosis
      $(document).on('click', '.open-sidebar-datetime-diagnosis', function() {
        // Intentar inicializar el calendario si no está inicializado
        if(!window.tryInitCalendarDiagnosis()) {
          // Si la librería no está disponible, cargarla primero
          if(typeof $.fn.pignoseCalendar !== "function") {
            window.loadPignoseCalendar(function() {
              window.tryInitCalendarDiagnosis();
            });
          }
        }
      });
      
      // Listener para cuando cambie la modalidad - actualizar estado disabled
      $(document).on('change', '#modalityAppointment', function() {
        const $calendar = $('#calendar-sidebar-diagnosis');
        const selectedValue = $(this).val();
        
        if (selectedValue && selectedValue !== '') {
          // Quitar disabled cuando hay modalidad seleccionada
          $calendar.removeClass('disabled');
          
          // Si el calendario no está inicializado, intentar inicializarlo
          if(!$calendar.data('pignoseCalendar')) {
            if(typeof $.fn.pignoseCalendar === "function") {
              window.tryInitCalendarDiagnosis();
            } else {
              window.loadPignoseCalendar(function() {
                window.tryInitCalendarDiagnosis();
              });
            }
          }
        } else {
          // Si no hay modalidad seleccionada, agregar disabled (no destruir el calendario)
          $calendar.addClass('disabled');
        }
      });

      // Función para convertir hora 24h a formato 12h am/pm
      function formatTime12h(time24h) {
        if (!time24h) return '';
        const [hours, minutes] = time24h.split(':');
        const hour = parseInt(hours, 10);
        const ampm = hour >= 12 ? 'pm' : 'am';
        const hour12 = hour % 12 || 12; // Convierte 0 a 12 para medianoche
        return `${hour12}:${minutes} ${ampm}`;
      }

      // Restar horas a una hora en formato 24h "HH:mm" (para Denver: mostrar 2h atrás al usuario, guardar original)
      function subtractHoursFromTime24h(time24h, hoursToSubtract) {
        if (!time24h || hoursToSubtract === 0) return time24h;
        const [h, m] = time24h.split(':').map(function(n) { return parseInt(n, 10); });
        let totalMinutes = (h || 0) * 60 + (m || 0);
        totalMinutes -= hoursToSubtract * 60;
        if (totalMinutes < 0) totalMinutes += 24 * 60;
        const newH = Math.floor(totalMinutes / 60) % 24;
        const newM = totalMinutes % 60;
        return String(newH).padStart(2, '0') + ':' + String(newM).padStart(2, '0');
      }
      
      // Función para formatear fecha en español
      function formatDateSpanish(dateString) {
        if (!dateString) return '';
        const date = new Date(dateString + 'T00:00:00');
        const days = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
        const months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
        
        const dayOfWeek = days[date.getDay()];
        const day = date.getDate();
        const month = months[date.getMonth()];
        const year = date.getFullYear();
        
        return `${dayOfWeek} ${day} de ${month.charAt(0).toUpperCase() + month.slice(1)} de ${year}`;
      }
      
      // Función para actualizar el resumen de la consulta (hacerla global)
      window.updateAppointmentSummary = function() {
        const selectedDate = $('#dateAppointment').val();
        const selectedTime = $('#timeAppointment').val();
        const selectedModality = $('#modalityAppointment').val();
        
        const $summaryDiv = $('.appointment-summary');
        const $dateSpan = $('.appointment-date');
        const $timeSpan = $('.appointment-time');
        const $locationSpan = $('.appointment-location');
        
        // Verificar que los elementos existan
        if (!$summaryDiv.length || !$dateSpan.length || !$timeSpan.length || !$locationSpan.length) {
          console.warn('Elementos del resumen no encontrados');
          return;
        }
        
        // Verificar si hay modalidad, fecha y hora seleccionadas
        const allSelected = selectedModality && selectedDate && selectedTime;
        
        if (allSelected) {
          // Mostrar el div
          $summaryDiv.removeClass('hidden').addClass('flex');
          
          // Función auxiliar para formatear hora (definida localmente para evitar dependencias)
          function formatTime12hLocal(time24h) {
            if (!time24h) return '';
            const [hours, minutes] = time24h.split(':');
            const hour = parseInt(hours, 10);
            const ampm = hour >= 12 ? 'pm' : 'am';
            const hour12 = hour % 12 || 12;
            return `${hour12}:${minutes} ${ampm}`;
          }
          
          // Función auxiliar para formatear fecha (definida localmente para evitar dependencias)
          function formatDateSpanishLocal(dateString) {
            if (!dateString) return '';
            const date = new Date(dateString + 'T00:00:00');
            const days = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
            const months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
            
            const dayOfWeek = days[date.getDay()];
            const day = date.getDate();
            const month = months[date.getMonth()];
            const year = date.getFullYear();
            
            return `${dayOfWeek} ${day} de ${month.charAt(0).toUpperCase() + month.slice(1)} de ${year}`;
          }
          
          // Actualizar fecha
          $dateSpan.text(formatDateSpanishLocal(selectedDate));
          
          // Actualizar hora (Denver: mostrar 2h atrás al usuario)
          const $summarySidebar = $summaryDiv.closest('.sidebar-diagnosis');
          const denverOffset = $summarySidebar.length && parseInt($summarySidebar.data('denverTimeOffset'), 10);
          const timeToShow = denverOffset ? subtractHoursFromTime24h(selectedTime, denverOffset) : selectedTime;
          $timeSpan.text(formatTime12hLocal(timeToShow));
          
          // Actualizar ubicación según modalidad
          if (selectedModality === 'telemedicina') {
            $locationSpan.text('línea a través de Rogans App');
          } else if (selectedModality === 'presencial') {
            $locationSpan.text('Bogotá (Autopista Norte # 106 - 71)');
          } else {
            $locationSpan.text('Bogotá (Autopista Norte # 106 - 71)');
          }
        } else {
          // Ocultar el div si falta alguna selección
          $summaryDiv.addClass('hidden').removeClass('flex');
        }
      };
      
      function onSelectDateCalendar(date) {
        var fecha = '';
        if(date[0] !== null) {
          fecha += date[0].format('YYYY-MM-DD');
          const selectedDate = new Date(fecha);
          const dayOfWeek = selectedDate.getDay();
          
          // Guardar la fecha seleccionada en el input hidden
          $('#dateAppointment').val(fecha);
          
          // Disparar evento change para actualizar botón de confirmar
          $('#dateAppointment').trigger('change');
          
          // Actualizar resumen
          if (typeof window.updateAppointmentSummary === 'function') {
            window.updateAppointmentSummary();
          }
          
          // Consultar API para obtener horas disponibles
          fetchAvailableSlots(fecha);
        } else {
          // Deshabilitar select de hora y mostrar "Seleccione fecha"
          const $timeSelect = $('#timeAppointment');
          $timeSelect.prop('disabled', true);
          $timeSelect.html('<option value="">Seleccione fecha</option>');
          
          // Limpiar el valor del input de fecha
          $('#dateAppointment').val('');
          
          // Disparar evento change para actualizar botón de confirmar
          $('#dateAppointment').trigger('change');
          
          // Actualizar resumen (ocultar si estaba visible)
          if (typeof window.updateAppointmentSummary === 'function') {
            window.updateAppointmentSummary();
          }
        }
      };
      
      // Función para verificar si una hora está en el rango permitido para telemedicina (13:00 - 16:45)
      function isTimeInTelemedicinaRange(time24h) {
        const [hours, minutes] = time24h.split(':');
        const totalMinutes = parseInt(hours, 10) * 60 + parseInt(minutes, 10);
        const startMinutes = 13 * 60; // 13:00 = 780 minutos
        const endMinutes = 16 * 60 + 45; // 16:45 = 1005 minutos
        return totalMinutes >= startMinutes && totalMinutes <= endMinutes;
      }
      
      // Función para consultar horas disponibles desde la API
      function fetchAvailableSlots(date) {
        const $timeSelect = $('#timeAppointment');
        const selectedModality = $('#modalityAppointment').val();
        
        // Deshabilitar select y mostrar estado de carga
        $timeSelect.prop('disabled', true);
        $timeSelect.html('<option value="">Cargando...</option>');
        
        // Hacer petición a la API
        fetch(`https://external.rogansya.com/externals-api.php?action=available-dots&day=${date}`)
          .then(function(response) {
            if (!response.ok) {
              throw new Error('Error en la respuesta de la API');
            }
            return response.json();
          })
          .then(function(data) {
            // Limpiar select (ya hay fecha seleccionada, así que "Selecciona hora")
            $timeSelect.html('<option value="" class="hidden text-gray-400">Selecciona hora</option>');
            
            // Verificar si hay slots disponibles (data es directamente un array de strings)
            if (Array.isArray(data) && data.length > 0) {
              // Filtrar slots según la modalidad
              let filteredSlots = data;
              
              if (selectedModality === 'telemedicina') {
                // Para telemedicina, solo mostrar slots entre 13:00 (1pm) y 16:45 (4:45pm)
                filteredSlots = data.filter(function(time) {
                  return isTimeInTelemedicinaRange(time);
                });
              }
              // Para presencial, mostrar todos los slots sin filtrar
              
              // Agregar cada slot filtrado como opción
              if (filteredSlots.length > 0) {
                const $sidebar = $timeSelect.closest('.sidebar-diagnosis');
                const denverOffset = $sidebar.length && parseInt($sidebar.data('denverTimeOffset'), 10);
                filteredSlots.forEach(function(time) {
                  const timeValue = time; // Valor original (API) para enviar al backend
                  const timeText = denverOffset ? formatTime12h(subtractHoursFromTime24h(time, denverOffset)) : formatTime12h(time);
                  $timeSelect.append(`<option value="${timeValue}">${timeText}</option>`);
                });
                
                // Habilitar select
                $timeSelect.prop('disabled', false);
              } else {
                // No hay horarios disponibles en el rango permitido
                $timeSelect.html('<option value="">Sin horarios disponibles</option>');
                $timeSelect.prop('disabled', true);
              }
            } else {
              // Array vacío o sin datos
              $timeSelect.html('<option value="">Sin horarios disponibles</option>');
              $timeSelect.prop('disabled', true);
            }
          })
          .catch(function(error) {
            console.error('Error al obtener horarios disponibles:', error);
            $timeSelect.html('<option value="">Sin horarios disponibles</option>');
            $timeSelect.prop('disabled', true);
          });
      }
    };

    // ========== Calendario sidebar cita general (independiente del capilar) ==========
    if($('#calendar-sidebar-diagnosis-general').length) {
      const DISABLED_DATES_GENERAL = ["2025-04-17", "2025-04-18", "2025-04-19", "2025-04-26", "2025-05-01", "2025-06-02", "2025-06-23", "2025-06-30", "2025-07-20", "2025-08-07", "2025-08-18", "2025-10-13", "2025-11-03", "2025-11-17", "2025-12-08", "2025-12-24", "2025-12-25", "2025-12-31", "2026-01-01", "2026-01-12", "2026-03-23", "2026-04-02", "2026-04-03", "2026-04-04", "2026-05-01", "2026-05-18", "2026-06-08", "2026-06-15", "2026-06-29", "2026-07-20", "2026-08-07", "2026-08-17", "2026-10-12", "2026-11-02", "2026-11-16", "2026-12-08", "2026-12-25"];

      function getPreviousDayBogotaGeneral() {
        const now = new Date();
        const bogotaDate = new Date(now.toLocaleString("en-US", { timeZone: "America/Bogota" }));
        bogotaDate.setDate(bogotaDate.getDate() - 1);
        const year = bogotaDate.getFullYear();
        const month = String(bogotaDate.getMonth() + 1).padStart(2, '0');
        const day = String(bogotaDate.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      }

      function formatTime12hGeneral(time24h) {
        if (!time24h) return '';
        const parts = time24h.split(':');
        const hour = parseInt(parts[0], 10);
        const ampm = hour >= 12 ? 'pm' : 'am';
        const hour12 = hour % 12 || 12;
        return `${hour12}:${parts[1] || '00'} ${ampm}`;
      }

      function isTimeInTelemedicinaRangeGeneral(time24h) {
        const parts = time24h.split(':');
        const totalMinutes = parseInt(parts[0], 10) * 60 + parseInt(parts[1] || 0, 10);
        return totalMinutes >= 13 * 60 && totalMinutes <= 16 * 60 + 45;
      }

      /** Checkout psicología: martes–viernes en UI; slots 10:00–17:00 presencial y telemedicina. */
      function isTimeInPsicologiaCheckoutRangeGeneral(time24h) {
        const parts = time24h.split(':');
        const totalMinutes = parseInt(parts[0], 10) * 60 + parseInt(parts[1] || 0, 10);
        return totalMinutes >= 10 * 60 && totalMinutes <= 17 * 60;
      }

      function getModalityGeneral() {
        const $checked = $('input[name="modalityAppointmentGeneral"]:checked');
        return $checked.length ? $checked.val() : '';
      }

      function fetchAvailableSlotsGeneral(date) {
        const $timeSelect = $('#timeAppointmentGeneral');
        const selectedModality = getModalityGeneral();
        const $specialtySel = $('#specialtyAppointment');
        $timeSelect.prop('disabled', true).html('<option value="">Cargando...</option>');
        // Horarios REALES por especialidad: proxy admin-ajax de available-slots
        // de Odoo con el servicio_id del <option> seleccionado. (Antes usaba
        // available-dots genérico: mismos horarios para TODAS las especialidades.)
        const servicioId = parseInt($specialtySel.find('option:selected').attr('data-servicio-id'), 10) || 1;
        fetch('/wp-admin/admin-ajax.php?action=rogans_available_slots&day=' + encodeURIComponent(date) + '&servicio_id=' + encodeURIComponent(servicioId))
          .then(function(response) {
            if (!response.ok) throw new Error('Error en la respuesta de la API');
            return response.json();
          })
          .then(function(data) {
            $timeSelect.html('<option value="" class="hidden text-gray-400">Selecciona hora</option>');
            const slots = (data && Array.isArray(data.slots)) ? data.slots : [];
            const times = slots.map(function(s) { return s && s.hora_inicio; }).filter(Boolean);
            if (times.length > 0) {
              let filteredSlots = times;
              if (window._psicologiaCheckoutSidebar) {
                filteredSlots = times.filter(function(time) {
                  return isTimeInPsicologiaCheckoutRangeGeneral(time);
                });
              } else if (selectedModality === 'telemedicina') {
                // Filtro 1pm–4:45pm de telemedicina: SOLO capilar. En el sidebar
                // del home se decide por la especialidad seleccionada; en otras
                // páginas (sin select), por los flags legacy de página.
                const esCapilar = $specialtySel.length
                  ? ($specialtySel.val() === 'Capilar primera vez')
                  : !(window._medicinaFuncionalPage || window._facialPage || window._dermatologiaPage);
                if (esCapilar) {
                  filteredSlots = times.filter(function(time) {
                    return isTimeInTelemedicinaRangeGeneral(time);
                  });
                }
              }
              if (filteredSlots.length > 0) {
                filteredSlots.forEach(function(time) {
                  $timeSelect.append(`<option value="${time}">${formatTime12hGeneral(time)}</option>`);
                });
                $timeSelect.prop('disabled', false);
              } else {
                $timeSelect.html('<option value="">Sin horarios disponibles</option>').prop('disabled', true);
              }
            } else {
              $timeSelect.html('<option value="">Sin horarios disponibles</option>').prop('disabled', true);
            }
          })
          .catch(function(error) {
            console.error('Error al obtener horarios general:', error);
            $timeSelect.html('<option value="">Sin horarios disponibles</option>').prop('disabled', true);
          });
      }

      function onSelectDateCalendarGeneral(date) {
        const $dateInput = $('#dateAppointmentGeneral');
        const $timeSelect = $('#timeAppointmentGeneral');
        const $confirmBtn = $('#confirm-datetime-schedule-diagnosis-general');
        if (date && date[0] !== null) {
          const fecha = date[0].format('YYYY-MM-DD');
          $dateInput.val(fecha).trigger('change');
          if (typeof window.updateAppointmentSummaryGeneral === 'function') {
            window.updateAppointmentSummaryGeneral();
          }
          if ($confirmBtn.length) {
            const modality = getModalityGeneral();
            const time = $timeSelect.val();
            $confirmBtn.prop('disabled', !(modality && fecha && time));
          }
          fetchAvailableSlotsGeneral(fecha);
        } else {
          $dateInput.val('');
          $timeSelect.prop('disabled', true).html('<option value="" class="hidden text-gray-400">Selecciona fecha</option>');
          $dateInput.trigger('change');
          if (typeof window.updateAppointmentSummaryGeneral === 'function') {
            window.updateAppointmentSummaryGeneral();
          }
          if ($confirmBtn.length) $confirmBtn.prop('disabled', true);
        }
      }

      /* ----------------------------------------------------------------------
       * Días con agenda REAL en Odoo para el calendario general (home).
       *
       * Antes este calendario ofrecía días fijos por especialidad/modalidad
       * aunque no hubiera un solo cupo, y el paciente se topaba con la fecha
       * sin horarios. Es el mismo problema que ya se resolvió en
       * sidebar-agendamiento.php y sidebar-fechas.php; aquí se porta el mismo
       * criterio.
       *
       * Se apaga por COMPLEMENTO cada día SIN cupos hasta `scanned_until`, y
       * ese día es el tope (maxDate): más allá Odoo no revisó, así que no se
       * ofrece nada. Desde el 2026-10-02 manda SOLO Odoo (regla del usuario:
       * "todo debe validarse con los endpoints de Odoo, no con reglas fijas").
       * -------------------------------------------------------------------- */
      function agendaACalendarioGeneral(data) {
        if (!data || !Array.isArray(data.dates)) return null;
        var conCupo = {};
        for (var i = 0; i < data.dates.length; i++) {
          if (data.dates[i] && data.dates[i].date) conCupo[data.dates[i].date] = true;
        }
        var ultimo = data.scanned_until || (data.dates.length ? data.dates[data.dates.length - 1].date : '');
        if (!ultimo) return null;
        var apagados = [];
        var d = new Date();
        d.setHours(12, 0, 0, 0); // mediodía local: evita corrimientos por zona horaria
        var fin = new Date(ultimo + 'T12:00:00');
        for (; d <= fin; d.setDate(d.getDate() + 1)) {
          var iso = d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
          if (!conCupo[iso]) apagados.push(iso);
        }
        return { apagados: apagados, maxDate: ultimo, vacia: data.dates.length === 0 };
      }

      // Servicio y modalidad vigentes en el sidebar del home.
      function servicioIdGeneral() {
        var $op = $('#specialtyAppointment option:selected');
        if ($op.length) return parseInt($op.attr('data-servicio-id'), 10) || 0;
        // Sidebars de una sola especialidad (p. ej. psicología en el checkout)
        // publican aquí su servicio de Odoo.
        return parseInt(window.ROGANS_SERVICIO_ID_GENERAL, 10) || 0;
      }
      function modalidadGeneral() {
        return $('input[name="modalityAppointmentGeneral"]:checked').val() || '';
      }

      // Caché en página por servicio+modalidad (el proxy además cachea server-side).
      var AVDATES_GENERAL = {};
      function fetchDiasDisponiblesGeneral(servicioId, modalidad, cb) {
        var clave = servicioId + '|' + modalidad;
        if (AVDATES_GENERAL[clave] !== undefined) { cb(AVDATES_GENERAL[clave]); return; }
        fetch('/wp-admin/admin-ajax.php?action=rogans_available_dates&servicio_id='
          + encodeURIComponent(servicioId) + '&modalidad=' + encodeURIComponent(modalidad || ''))
          .then(function(r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
          .then(function(data) {
            var cfg = agendaACalendarioGeneral(data);
            if (cfg) AVDATES_GENERAL[clave] = cfg; // sin dato de Odoo no se cachea: se reintenta
            cb(cfg);
          })
          .catch(function(err) {
            console.error('Error al cargar días con agenda (general):', err);
            cb(null); // sin cachear: se reintenta en el próximo montaje
          });
      }

      // Velo mientras se consultan los días: el calendario nace con las reglas
      // estáticas para no quedar en blanco si Odoo tarda, así que sin esto se
      // alcanzan a ver días que un instante después desaparecen.
      function velaCargandoGeneral(on) {
        var $c = $('#calendar-sidebar-diagnosis-general');
        if (!$c.length) return;
        $c.find('.rogans-cal-loading').remove();
        if (!on) return;
        if ($c.css('position') === 'static') $c.css('position', 'relative');
        $c.append(
          '<div class="rogans-cal-loading absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 bg-white text-gray-600 text-xs">' +
            '<span class="inline-block w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin"></span>' +
            '<span>Cargando fechas disponibles…</span>' +
          '</div>'
        );
      }

      // Aviso sobre el calendario cuando Odoo no da días: sin Odoo no se ofrecen
      // días fijos, que podrían no existir (regla del usuario, 2026-10-02).
      // 'error' = no respondió, con botón para reintentar; 'vacia' = sin cupos.
      function avisoGeneral(tipo, dias) {
        var $c = $('#calendar-sidebar-diagnosis-general');
        if (!$c.length) return;
        $c.find('.rogans-cal-loading').remove();
        if ($c.css('position') === 'static') $c.css('position', 'relative');
        var $v = $('<div class="rogans-cal-loading absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-white text-gray-600 text-sm text-center px-6"></div>');
        $v.append($('<span></span>').text(tipo === 'vacia' ? 'Por ahora no hay cupos disponibles en esta modalidad.' : 'No pudimos cargar las fechas disponibles.'));
        if (tipo !== 'vacia') {
          $v.append($('<button type="button" class="text-primary-600 font-semibold underline">Reintentar</button>').on('click', function () {
            window.initCalendarDiagnosisGeneral(dias);
          }));
        }
        $c.append($v);
      }

      // Pinta el calendario. `agenda` es la de Odoo (agendaACalendarioGeneral):
      // con ella manda solo Odoo; sin ella quedan las reglas de siempre, tapadas
      // por el velo hasta que Odoo responda.
      function pintarCalendarioGeneral(disabledWeekdays, agenda) {
        if (typeof $ === 'undefined' || typeof $.fn === 'undefined' || typeof $.fn.pignoseCalendar !== "function") {
          console.warn('pignoseCalendar no está disponible (general)');
          return false;
        }
        const $calendar = $('#calendar-sidebar-diagnosis-general');
        if (!$calendar.length) return false;
        const currentDate = new Date().toISOString().split('T')[0];
        const previousDayBogota = getPreviousDayBogotaGeneral();
        if ($calendar.data('pignoseCalendar')) {
          try {
            $calendar.pignoseCalendar('destroy');
          } catch (e) {
            console.warn('Error al destruir calendario general:', e);
          }
        }
        try {
          $calendar.pignoseCalendar({
            date: previousDayBogota,
            format: 'YYYY-MM-DD',
            disabledDates: agenda ? agenda.apagados : DISABLED_DATES_GENERAL,
            disabledWeekdays: agenda ? [] : (disabledWeekdays || [0, 1]),
            maxDate: agenda && agenda.maxDate ? agenda.maxDate : null,
            minDate: currentDate,
            week: 1,
            lang: 'es',
            select: onSelectDateCalendarGeneral
          });
          return true;
        } catch (e) {
          console.error('Error al inicializar pignoseCalendar general:', e);
          return false;
        }
      }

      /**
       * Entrada pública (la llaman main.js y sidebar-appointment-general.php).
       * Pinta de una con las reglas estáticas —así nunca queda en blanco— y
       * enseguida refina con los días que Odoo diga que tienen cupo.
       * Devuelve síncronamente si alcanzó a pintar, como antes.
       */
      window.initCalendarDiagnosisGeneral = function(disabledWeekdays) {
        var servicioId = servicioIdGeneral();
        var modalidad  = modalidadGeneral();
        var clave      = servicioId + '|' + modalidad;

        // Si ya se conocen los días de este servicio/modalidad, se pinta directo.
        if (servicioId > 0 && AVDATES_GENERAL[clave] !== undefined) {
          var yaPintado = pintarCalendarioGeneral(disabledWeekdays, AVDATES_GENERAL[clave]);
          if (AVDATES_GENERAL[clave].vacia) avisoGeneral('vacia', disabledWeekdays);
          return yaPintado;
        }

        var pintado = pintarCalendarioGeneral(disabledWeekdays, null);
        if (!pintado || servicioId <= 0) return pintado;

        velaCargandoGeneral(true);
        fetchDiasDisponiblesGeneral(servicioId, modalidad, function(agenda) {
          velaCargandoGeneral(false);
          // Sin Odoo no se ofrecen días fijos (podrían no existir): aviso + reintentar.
          if (!agenda) { avisoGeneral('error', disabledWeekdays); return; }
          // Si la fecha ya elegida se quedó sin cupos, se limpia: con ese día
          // el agendamiento fallaría igual.
          var $fecha = $('#dateAppointmentGeneral');
          var sel = $fecha.length ? ($fecha.val() || '') : '';
          if (sel && (agenda.apagados.indexOf(sel) !== -1 || (agenda.maxDate && sel > agenda.maxDate))) {
            $fecha.val('');
            $('#timeAppointmentGeneral')
              .html('<option value="" class="hidden text-gray-400">Selecciona fecha</option>')
              .prop('disabled', true);
          }
          pintarCalendarioGeneral(disabledWeekdays, agenda);
          if (agenda.vacia) avisoGeneral('vacia', disabledWeekdays);
        });
        return pintado;
      };

      // Días deshabilitados del calendario general. Si el sidebar del home está
      // presente (publica window.ROGANS_HOME_CITAS_CFG), los días salen de la
      // ESPECIALIDAD seleccionada (+ modalidad). Si no, comportamiento legacy.
      function getDiasGeneral(modality) {
        const cfgAll = window.ROGANS_HOME_CITAS_CFG;
        const $sel = $('#specialtyAppointment');
        if (cfgAll && $sel.length) {
          const cfg = cfgAll[$sel.val()];
          if (cfg && cfg.dias) return cfg.dias[modality || 'presencial'] || [0, 1];
        }
        if (window._psicologiaCheckoutSidebar) return [0, 1, 6];
        return (modality === 'telemedicina') ? [0, 1, 6] : [0, 1];
      }

      window.tryInitCalendarDiagnosisGeneral = function() {
        const $calendar = $('#calendar-sidebar-diagnosis-general');
        const modality = getModalityGeneral();
        if (!modality || modality === '') {
          $calendar.addClass('disabled');
          return false;
        }
        $calendar.removeClass('disabled');
        if ($calendar.data('pignoseCalendar')) {
          return true;
        }
        if (typeof $.fn.pignoseCalendar !== "function") {
          return false;
        }
        return window.initCalendarDiagnosisGeneral(getDiasGeneral(modality));
      };

      $(document).on('change', 'input[name="modalityAppointmentGeneral"]', function() {
        const $calendar = $('#calendar-sidebar-diagnosis-general');
        const selectedValue = $(this).val();
        if (selectedValue && selectedValue !== '') {
          $calendar.removeClass('disabled');
          if (!$calendar.data('pignoseCalendar')) {
            if (typeof $.fn.pignoseCalendar === 'function') {
              window.initCalendarDiagnosisGeneral(getDiasGeneral(selectedValue));
            } else if (typeof window.loadPignoseCalendar === 'function') {
              window.loadPignoseCalendar(function() {
                window.initCalendarDiagnosisGeneral(getDiasGeneral(selectedValue));
              });
            }
          }
        } else {
          $calendar.addClass('disabled');
        }
      });

      $(document).on('click', '.open-datetime-general', function() {
        if (!window.tryInitCalendarDiagnosisGeneral() && typeof window.loadPignoseCalendar === 'function') {
          window.loadPignoseCalendar(function() {
            window.tryInitCalendarDiagnosisGeneral();
          });
        }
      });

      window.updateConfirmButtonGeneral = function() {
        const $confirmBtn = $('#confirm-datetime-schedule-diagnosis-general');
        if (!$confirmBtn.length) return;
        const modality = getModalityGeneral();
        const date = $('#dateAppointmentGeneral').val();
        const time = $('#timeAppointmentGeneral').val();
        $confirmBtn.prop('disabled', !(modality && date && time));
      };

      window.updateAppointmentSummaryGeneral = function() {
        const selectedDate = $('#dateAppointmentGeneral').val();
        const selectedTime = $('#timeAppointmentGeneral').val();
        const selectedModality = getModalityGeneral();
        const $summaryDiv = $('.sidebar-appointment-general .appointment-summary-general');
        const $dateSpan = $summaryDiv.find('.appointment-date');
        const $timeSpan = $summaryDiv.find('.appointment-time');
        const $locationSpan = $summaryDiv.find('.appointment-location');
        if (!$summaryDiv.length || !$dateSpan.length || !$timeSpan.length || !$locationSpan.length) return;
        if (selectedModality && selectedDate && selectedTime) {
          $summaryDiv.removeClass('hidden').addClass('flex');
          const date = new Date(selectedDate + 'T00:00:00');
          const days = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
          const months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
          const dayOfWeek = days[date.getDay()];
          const day = date.getDate();
          const month = months[date.getMonth()];
          const year = date.getFullYear();
          $dateSpan.text(dayOfWeek + ' ' + day + ' de ' + month.charAt(0).toUpperCase() + month.slice(1) + ' de ' + year);
          $timeSpan.text(formatTime12hGeneral(selectedTime));
          $locationSpan.text(selectedModality === 'telemedicina' ? 'Telemedicina a través App de Rogans' : 'Bogotá (Autopista Norte # 106 - 71)');
        } else {
          $summaryDiv.addClass('hidden').removeClass('flex');
        }
      };

      $(document).on('change', '#timeAppointmentGeneral', function() {
        if (typeof window.updateAppointmentSummaryGeneral === 'function') window.updateAppointmentSummaryGeneral();
        if (typeof window.updateConfirmButtonGeneral === 'function') window.updateConfirmButtonGeneral();
      });

      $(document).on('change', '#dateAppointmentGeneral', function() {
        if (typeof window.updateConfirmButtonGeneral === 'function') window.updateConfirmButtonGeneral();
      });
    }

    // Custom Select con Imágenes (Banderas)
    if($('.custom-select-image').length) {
      $('.custom-select-image').each(function() {
        const $selectContainer = $(this);
        const $button = $selectContainer.find('.custom-select-image-button');
        const $dropdown = $selectContainer.find('.custom-select-image-dropdown');
        const $options = $selectContainer.find('.custom-select-image-option');
        const $placeholder = $selectContainer.find('.custom-select-image-placeholder');
        const $selected = $selectContainer.find('.custom-select-image-selected');
        const $selectedImage = $selectContainer.find('.custom-select-image-flag');
        const $selectedText = $selectContainer.find('.custom-select-image-text');
        const $arrow = $selectContainer.find('.custom-select-image-arrow');

        // Obtener orientación del dropdown (up o down, por defecto down)
        const dropdownPosition = $selectContainer.data('dropdown-position') || 'down';
        
        // Aplicar clases según la orientación
        if(dropdownPosition === 'up') {
          $dropdown.removeClass('top-full mt-2').addClass('bottom-full mb-2');
        } else {
          $dropdown.removeClass('bottom-full mb-2').addClass('top-full mt-2');
        }

        // Seleccionar primer elemento por defecto
        const $firstOption = $options.first();
        if($firstOption.length && !$selectedImage.attr('src')) {
          const firstValue = $firstOption.data('value');
          const firstFlag = $firstOption.data('flag');
          const firstName = $firstOption.data('name');

          // Marcar radio button
          $firstOption.find('input[type="radio"]').prop('checked', true);
          $firstOption.addClass('bg-blue-50');

          // Actualizar display
          $selectedImage.attr('src', firstFlag).attr('alt', firstName);
          $selectedText.text(firstName);
          $placeholder.addClass('hidden');
          $selected.removeClass('hidden').addClass('flex');

          // Trigger custom event
          $selectContainer.trigger('customSelectImageSelected', [firstValue, firstFlag, firstName]);
        }

        // Toggle dropdown
        $button.on('click', function(e) {
          e.stopPropagation();
          const isOpen = !$dropdown.hasClass('hidden');
          
          // Cerrar otros selects abiertos
          $('.custom-select-image-dropdown').not($dropdown).addClass('hidden');
          $('.custom-select-image-arrow').not($arrow).removeClass('rotate-180');
          $('.custom-select-image-button').not($button).attr('aria-expanded', 'false');
          
          if(!isOpen) {
            $dropdown.removeClass('hidden');
            $arrow.addClass('rotate-180');
            $button.attr('aria-expanded', 'true');
          } else {
            $dropdown.addClass('hidden');
            $arrow.removeClass('rotate-180');
            $button.attr('aria-expanded', 'false');
          }
        });

        // Seleccionar opción
        $options.on('click', function(e) {
          e.stopPropagation();
          const $option = $(this);
          const value = $option.data('value');
          const flag = $option.data('flag');
          const name = $option.data('name');

          // Desmarcar otros radio buttons en el mismo grupo
          $selectContainer.find('input[type="radio"]').prop('checked', false);
          
          // Marcar radio button seleccionado
          $option.find('input[type="radio"]').prop('checked', true);

          // Remover estado activo de otras opciones
          $options.removeClass('bg-blue-50');
          
          // Agregar estado activo a la opción seleccionada
          $option.addClass('bg-blue-50');

          // Actualizar display
          $selectedImage.attr('src', flag).attr('alt', name);
          $selectedText.text(name);
          $placeholder.addClass('hidden');
          $selected.removeClass('hidden').addClass('flex');

          // Cerrar dropdown
          $dropdown.addClass('hidden');
          $arrow.removeClass('rotate-180');
          $button.attr('aria-expanded', 'false');

          // Trigger custom event
          $selectContainer.trigger('customSelectImageSelected', [value, flag, name]);
        });

        // Cerrar al hacer click fuera
        $(document).on('click.customSelectImage', function(e) {
          if(!$(e.target).closest('.custom-select-image').length) {
            $('.custom-select-image-dropdown').addClass('hidden');
            $('.custom-select-image-arrow').removeClass('rotate-180');
            $('.custom-select-image-button').attr('aria-expanded', 'false');
          }
        });

        // Cerrar con ESC
        $(document).on('keydown.customSelectImage', function(e) {
          if(e.key === 'Escape' && !$dropdown.hasClass('hidden')) {
            $dropdown.addClass('hidden');
            $arrow.removeClass('rotate-180');
            $button.attr('aria-expanded', 'false');
          }
        });
      });
    };

    // Hover Image Effect: al hacer hover sobre .hover-activate se muestra la .image-activate del mismo índice
    if ($('.hover-image-effect').length) {
      $('.hover-image-effect').each(function() {
        var $container = $(this);
        var $hoverItems = $container.find('.hover-activate');
        var $imageItems = $container.find('.image-activate');

        // Por defecto: primero activo en cada grupo
        $hoverItems.removeClass('active');
        $imageItems.removeClass('active').addClass('hidden');
        $hoverItems.eq(0).addClass('active');
        $imageItems.eq(0).addClass('active').removeClass('hidden');

        $hoverItems.on('mouseenter', function() {
          var idx = $hoverItems.index(this);
          $hoverItems.removeClass('active');
          $imageItems.removeClass('active').addClass('hidden');
          $hoverItems.eq(idx).addClass('active');
          $imageItems.eq(idx).addClass('active').removeClass('hidden');
        });
      });
    };

    // Agregar elementos <li> personalizados al principio y al final del menú Max Mega Menu en mobile
    function addMobileMenuSections() {
      var $megaMenu = $('.mega-menu');
      
      // Eliminar elementos personalizados existentes primero para evitar duplicados
      $megaMenu.find('.mega-menu-mobile-item-before, .mega-menu-mobile-item-after').remove();
      
      // Solo ejecutar si existe el menú y estamos en mobile
      if ($megaMenu.length && window.innerWidth < 992) {
        // Elemento <li> al principio del menú - Personaliza el contenido aquí
        var $liBefore = $(`<li class="mega-menu-item mega-menu-mobile-item-before">
          <img src="${URL_TEMPLATE}/images/logo-mobile.svg" alt="Logo Rogans" class="block w-auto h-8.5" fetchpriority="high" loading="eager" decoding="sync">
        </li>`);
        // Ejemplo de contenido - puedes personalizar esto
        // $liBefore.html('<a href="#" class="mega-menu-link">Contenido antes del menú</a>');
        $megaMenu.prepend($liBefore);
        
        // Elemento <li> al final del menú - Personaliza el contenido aquí
        var $liAfter = $(`<li class="mega-menu-item mega-menu-mobile-item-after">
          <p class="text-gray-50 text-base font-semibold !my-0 flex-none">Síguenos en</p>
          <ul class="list-none m-0 p-0 flex items-center justify-end gap-x-5 text-xl flex-auto">
            <li>
              <a href="https://www.instagram.com/rogans.formula" target="_blank" title="Instagram Rogans" class="w-9.5 h-9.5 rounded-full flex items-center justify-center bg-gray-900 text-primary-500 transition-all duration-300 hover:bg-gray-50">
                <i class="fa-brands fa-instagram"></i>
              </a>
            </li>
            <li>
              <a href="https://www.facebook.com/Rogansmen" target="_blank" title="Facebook Rogans" class="w-9.5 h-9.5 rounded-full flex items-center justify-center bg-gray-900 text-primary-500 transition-all duration-300 hover:bg-gray-50">
                <i class="fa-brands fa-facebook-f"></i>
              </a>
            </li>
            <li>
              <a href="https://www.tiktok.com/@rogans.formula" target="_blank" title="TikTok Rogans" class="w-9.5 h-9.5 rounded-full flex items-center justify-center bg-gray-900 text-primary-500 transition-all duration-300 hover:bg-gray-50">
                <i class="fa-brands fa-tiktok"></i>
              </a>
            </li>
          </ul>
        </li>`);
        // Ejemplo de contenido - puedes personalizar esto
        // $liAfter.html('<a href="#" class="mega-menu-link">Contenido después del menú</a>');
        $megaMenu.append($liAfter);
      }
    };

    // Ejecutar al cargar la página
    addMobileMenuSections();

    // Ejecutar al redimensionar la ventana
    $(window).on('resize', function() {
      addMobileMenuSections();
    });

    // Ejecutar después de que Max Mega Menu se inicialice (con un pequeño delay)
    setTimeout(function() {
      addMobileMenuSections();
    }, 500);

    // Ejecutar cuando el menú móvil se abra (usando eventos de Max Mega Menu)
    $(document).on('megaMenuAfterInit', function() {
      addMobileMenuSections();
    });

    // También ejecutar cuando se haga clic en el toggle del menú móvil
    $(document).on('click', '.mega-menu-toggle', function() {
      setTimeout(function() {
        addMobileMenuSections();
      }, 100);
    });

    // ============================================================
    // Tracking de CTAs de landings - convencion oficial de IDs:
    //   <ACTION>-ROGANS-<PAGE>-V<ver>-<N|FORM|STICKY|CTA>
    // Ejemplos: AGENDA-ROGANS-CAIDACABELLOMUJER-V1-1,
    //           WHATSAPP-ROGANS-HAIRTRANSPLANTUSA-V1-STICKY,
    //           AGENDA-ROGANS-CAIDACABELLOPAREJA-V1-FORM (submit del modal)
    // GTM (GTM-WM7ZCWBV) + Google Ads (AW-11551179499) ya cargados.
    // Cada click hace push a window.dataLayer: un evento custom
    // landing_cta_click (tracking por boton) y un evento GA4 estandar
    // segun la ACTION (generate_lead solo en el -FORM = submit real).
    // ============================================================
    var LANDING_PAGE_SLUG = {
      'CAIDACABELLOMUJER':         'caida-cabello-mujer',
      'CAIDACABELLOPAREJA':        'caida-cabello-pareja',
      'CAIDACABELLOPROFESIONALES': 'caida-cabello-profesionales',
      'HAIRTRANSPLANTUSA':         'hair-transplant-usa',
      'ESTADOSUNIDOS':             'hair-transplant-usa',
      'COSTARICA':                 'implante-capilar-costa-rica',
      'PANAMA':                    'implante-capilar-panama',
      // Sin esta entrada el slug caeria al fallback page.toLowerCase()
      // ('diagnosticocapilarv2') y en GA4 conviviria con el legible que emite
      // el generate_lead del test: dos nombres para la misma pagina.
      'DIAGNOSTICOCAPILARV2':      'diagnostico-capilar-v2'
    };

    var ACTION_EVENT = {
      'AGENDA':      { type: 'agendamiento', event: 'cta_click' },
      'WHATSAPP':    { type: 'whatsapp',     event: 'contact' },
      'VIDEO':       { type: 'play_video',   event: 'video_start' },
      'CERRARVIDEO': { type: 'close_video',  event: 'video_close' },
      'PLAN':        { type: 'plan_select',  event: 'select_item' },
      'ESTANCIA':    { type: 'estancia',     event: 'select_item' },
      'VERPLANES':   { type: 'ver_planes',   event: 'cta_click' },
      'HOSPEDAJE':   { type: 'hospedaje',    event: 'cta_click' },
      'TESTIMONIOS': { type: 'testimonios',  event: 'cta_click' },
      'TAB':         { type: 'tab_toggle',   event: 'cta_click' },
      'FORM':        { type: 'form',         event: 'cta_click' }
    };

    var LANDING_ID_RE = /^([A-Z]+)-ROGANS-([A-Z0-9]+)-V(\d+)-(.+)$/;

    $(document).on('click', '[id*="-ROGANS-"]', function() {
      var id = this.id || '';
      var m = id.match(LANDING_ID_RE);
      if (!m) return;

      var action = m[1];
      var page = m[2];
      var n = m[4];
      var map = ACTION_EVENT[action] || { type: action.toLowerCase(), event: 'cta_click' };
      var slug = LANDING_PAGE_SLUG[page] || page.toLowerCase();
      // -FORM = submit real del formulario de agendamiento -> lead
      var isFormSubmit = (action === 'AGENDA' && n === 'FORM');

      window.dataLayer = window.dataLayer || [];

      // Evento custom para tracking por boton individual en GTM
      window.dataLayer.push({
        event:        'landing_cta_click',
        cta_id:       id,
        cta_action:   action,
        cta_type:     isFormSubmit ? 'form_submit' : map.type,
        cta_n:        n,
        landing_page: page,
        landing_slug: slug,
        page_path:    window.location.pathname
      });

      // Evento GA4 estandar para mapear a conversiones de Google Ads/Meta
      var ga4Event = isFormSubmit ? 'generate_lead' : map.event;
      if (ga4Event !== 'cta_click') {
        window.dataLayer.push({
          event:        ga4Event,
          cta_id:       id,
          landing_page: page,
          landing_slug: slug
        });
      }
    });

    // El partial sidebar-appointment-general.php es compartido por muchas
    // paginas, asi que su boton submit no puede llevar un id de landing
    // hardcodeado. En las landings se lo asignamos por JS segun la clase
    // del body (mismo patron que el sticky de WhatsApp por template).
    var LANDING_TEMPLATE_PAGE = {
      'page-template-page-alopecia-mujer':              'CAIDACABELLOMUJER',
      'page-template-page-alopecia-pareja':             'CAIDACABELLOPAREJA',
      'page-template-page-alopecia-imagen-profesional': 'CAIDACABELLOPROFESIONALES',
      'page-template-page-hair-implant-us':             'HAIRTRANSPLANTUSA'
    };

    (function assignModalFormIds() {
      var bodyClass = document.body.className;
      for (var tpl in LANDING_TEMPLATE_PAGE) {
        if (bodyClass.indexOf(tpl) === -1) continue;
        var page = LANDING_TEMPLATE_PAGE[tpl];
        var $formSubmit = $('.sidebar-appointment-general .js-submit-schedule-form').first();
        if ($formSubmit.length && !$formSubmit.attr('id')) {
          $formSubmit.attr('id', 'AGENDA-ROGANS-' + page + '-V1-FORM');
        }
        var $modalForm = $('#form-schedule-appointment-general');
        if ($modalForm.length && !$modalForm.attr('data-landing-form-id')) {
          $modalForm.attr('data-landing-form-id', 'FORM-ROGANS-' + page + '-V1');
        }
        break;
      }
    })();

    // ============================================================
    // Deteccion GLOBAL por accion: cubre TODAS las landings (nuevas con
    // convencion ROGANS y viejas con cualquier esquema de IDs) sin tener
    // que renombrar sus botones. Emite los mismos eventos al dataLayer
    // (generate_lead / contact) para que GTM los capture con un solo
    // trigger. Evita doble conteo: si el elemento ya tiene un id de la
    // convencion ROGANS, ese handler [id*="-ROGANS-"] ya emitio el evento
    // y aqui se ignora.
    // ============================================================
    function rogansLandingSlug() {
      var p = (window.location.pathname || '').replace(/^\/+|\/+$/g, '');
      return p || 'home';
    }

    // 1) Submit del modal de agendamiento -> lead. Todos los modales del
    //    sitio (general, psicologia, capilar, dermatologia, etc.) usan la
    //    clase .js-submit-schedule-form.
    $(document).on('click', '.js-submit-schedule-form', function () {
      var id = this.id || '';
      if (id.indexOf('-ROGANS-') !== -1) return; // ya cubierto por el handler ROGANS
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push({
        event:        'generate_lead',
        cta_id:       id || 'modal-agendar',
        cta_type:     'form_submit',
        landing_slug: rogansLandingSlug(),
        page_path:    window.location.pathname,
        via:          'accion-global'
      });
    });

    // 2) Clic en cualquier enlace de WhatsApp -> contact (por href, sin
    //    importar la clase/id de la landing).
    $(document).on('click', 'a[href*="wa.link"], a[href*="wa.me"], a[href*="api.whatsapp"], a[href*="web.whatsapp"]', function () {
      var id = this.id || '';
      if (id.indexOf('-ROGANS-') !== -1) return; // ya cubierto por el handler ROGANS
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push({
        event:        'contact',
        cta_id:       id || 'whatsapp',
        cta_type:     'whatsapp',
        landing_slug: rogansLandingSlug(),
        page_path:    window.location.pathname,
        via:          'accion-global'
      });
    });

    lucide.createIcons();
    setTimeout(showBody, 100);
    initOwlCarousels();
  };

  function initOwlCarousels() {
    if($('.owl-cross-sells').length) {
      $('.owl-cross-sells').owlCarousel({
        loop: false,
        navText: [
          '<i class="fa-solid fa-arrow-left"></i>',
          '<i class="fa-solid fa-arrow-right"></i>',
        ],
        rewind: true,
        autoplay: true,
        autoplayTimeout: 6000,
        autoplayHoverPause: true,
        autoHeight: false,
        items: 2,
        dots: true,
        nav: false,
        responsive: {
          0: {
            margin: 13
          },
          768: {
            margin: 13
          },
          1280: {
            margin: 21
          },
        },
      });
    };
  
    if($('.owl-testimonies-product').length) {
      $('.prev-swiper-carousel-testimonials').click(function() {
        owlTrigger('.owl-testimonies-product', 'prev.owl.carousel');
      });
      $('.next-swiper-carousel-testimonials').click(function() {
        owlTrigger('.owl-testimonies-product', 'next.owl.carousel');
      });
      $('.owl-testimonies-product').owlCarousel({
        loop: false,
        navText: [
          '<i class="fa-solid fa-arrow-left"></i>',
          '<i class="fa-solid fa-arrow-right"></i>',
        ],
        rewind: true,
        autoplay: true,
        autoplayTimeout: 6000,
        autoplayHoverPause: true,
        autoHeight: true,
        dots: false,
        nav: false,
        responsive: {
          0: {
            items: 1,
            margin: 13
          },
          576: {
            items: 2,
            margin: 13
          },
          768: {
            items: 3,
            margin: 13
          },
          1280: {
            items: 4,
            margin: 21
          },
        },
      });
    };
  
    if($('.owl-testimonies-financial').length) {
      $('.prev-swiper-carousel-financial').click(function() {
        owlTrigger('.owl-testimonies-financial', 'prev.owl.carousel');
      });
  
      $('.next-swiper-carousel-financial').click(function() {
        owlTrigger('.owl-testimonies-financial', 'next.owl.carousel');
      });
  
      $('.owl-testimonies-financial').owlCarousel({
        loop: false,
        navText: [
          '<i class="fa-solid fa-arrow-left"></i>',
          '<i class="fa-solid fa-arrow-right"></i>',
        ],
        rewind: true,
        autoplay: true,
        autoplayTimeout: 6000,
        autoplayHoverPause: true,
        autoHeight: true,
        dots: false,
        nav: false,
        autoWidth: true,
        responsive: {
          0: {
            margin: 13
          },
          576: {
            margin: 13
          },
          768: {
            margin: 13
          },
          1280: {
            margin: 21
          },
        },
      });
    };
  
    if($('.owl-kits-financial').length) {
      $('.prev-swiper-kits-financial').click(function() {
        owlTrigger('.owl-kits-financial', 'prev.owl.carousel');
      });
  
      $('.next-swiper-kits-financial').click(function() {
        owlTrigger('.owl-kits-financial', 'next.owl.carousel');
      });
  
      $('.owl-kits-financial').owlCarousel({
        loop: false,
        navText: [
          '<i class="fa-solid fa-arrow-left"></i>',
          '<i class="fa-solid fa-arrow-right"></i>',
        ],
        rewind: true,
        autoplay: true,
        autoplayTimeout: 6000,
        autoplayHoverPause: true,
        autoHeight: true,
        dots: false,
        nav: false,
        responsive: {
          0: {
            items: 1,
            margin: 13
          },
          576: {
            items: 1,
            margin: 13
          },
          768: {
            items: 1,
            margin: 13
          },
          768: {
            items: 2,
            margin: 21
          },
          1280: {
            items: 2,
            margin: 21
          },
        },
      });
    };
  
    if($('.owl-blogs-nutricion').length) {
      $('.owl-blogs-nutricion').owlCarousel({
        loop: false,
        navText: [
          '<i class="fa-solid fa-arrow-left"></i>',
          '<i class="fa-solid fa-arrow-right"></i>',
        ],
        rewind: true,
        autoplay: true,
        autoplayTimeout: 6000,
        autoplayHoverPause: true,
        autoHeight: false,
        dots: false,
        nav: false,
        center: false,
        stagePadding: 0,
        responsive: {
          0: {
            items: 1,
            margin: 16,
            stagePadding: 50,
            center: false
          },
          576: {
            items: 1,
            margin: 16,
            stagePadding: 80,
            center: false
          },
          768: {
            items: 2,
            margin: 16,
            stagePadding: 60,  // Muestra 60px del siguiente item en tablet/desktop
            center: false
          },
          1024: {
            items: 2,
            margin: 21,
            stagePadding: 80,  // Muestra 80px del siguiente item en desktop
            center: false
          },
          1280: {
            items: 2,
            margin: 21,
            stagePadding: 100, // Muestra 100px del siguiente item en pantallas grandes
            center: false
          }
        }
      });
    };
  
    if($('.owl-productos-mexico').length) {
      $('.owl-productos-mexico').owlCarousel({
        loop: false,
        rewind: true,
        autoplay: false,
        autoplayTimeout: 6000,
        autoplayHoverPause: true,
        autoHeight: true,
        dots: true,
        nav: false,
        responsive: {
          0: {
            items: 1,
            margin: 13
          },
          576: {
            items: 2,
            margin: 13
          },
          768: {
            items: 3,
            margin: 13
          },
          992: {
            items: 3,
            margin: 32
          },
          1280: {
            items: 3,
            margin: 48
          },
          1366: {
            items: 3,
            margin: 64
          }
        }
      });
    };
  
    if($('.owl-weight-loss-testimonies').length) {
      $('.owl-weight-loss-testimonies').owlCarousel({
        loop: false,
        navText: [
          '<i class="fa-solid fa-arrow-left"></i>',
          '<i class="fa-solid fa-arrow-right"></i>',
        ],
        rewind: true,
        autoplay: true,
        autoplayTimeout: 6000,
        autoplayHoverPause: true,
        autoHeight: false,
        dots: false,
        nav: false,
        responsive: {
          0: {
            items: 2,
            autoWidth: true,
            margin: 13
          },
          768: {
            autoWidth: false,
            margin: 13
          },
          1280: {
            margin: 21
          },
        },
      });
    };
  
    if($('.owl-weight-testimonies').length) {
      $('.owl-weight-testimonies').owlCarousel({
        loop: false,
        navText: [
          '<i class="fa-solid fa-arrow-left"></i>',
          '<i class="fa-solid fa-arrow-right"></i>',
        ],
        rewind: true,
        autoplay: true,
        autoplayTimeout: 6000,
        autoplayHoverPause: true,
        autoHeight: false,
        dots: false,
        nav: false,
        responsive: {
          0: {
            items: 2,
            autoWidth: true,
            margin: 13
          },
          768: {
            items: 3,
            autoWidth: false,
            margin: 13
          },
          1280: {
            items: 4,
            margin: 21
          },
        },
      });
    };
  
    if($('.owl-testimonios-financial').length) {
      $('.owl-testimonios-financial').owlCarousel({
        loop: false,
        navText: [
          '<i class="fa-solid fa-arrow-left"></i>',
          '<i class="fa-solid fa-arrow-right"></i>',
        ],
        rewind: true,
        autoplay: true,
        autoplayTimeout: 6000,
        autoplayHoverPause: true,
        autoHeight: false,
        dots: true,
        nav: false,
        responsive: {
          0: {
            items: 1,
            margin: 13
          },
          576: {
            items: 2,
            margin: 13
          },
          768: {
            items: 3,
            margin: 13
          },
          1280: {
            items: 4,
            margin: 21
          },
        },
      });
    };
  
    if($('.owl-testimonios-examenes').length) {
      $('.owl-testimonios-examenes').owlCarousel({
        loop: false,
        navText: [
          '<i class="fa-solid fa-arrow-left"></i>',
          '<i class="fa-solid fa-arrow-right"></i>',
        ],
        rewind: true,
        autoplay: true,
        autoplayTimeout: 6000,
        autoplayHoverPause: true,
        autoHeight: false,
        dots: true,
        nav: false,
        responsive: {
          0: {
            items: 1,
            margin: 13
          },
          576: {
            items: 2,
            margin: 13
          },
          768: {
            items: 3,
            margin: 13
          },
          1280: {
            items: 4,
            margin: 21
          },
        },
      });
    };
  
    if($('.owl-testimonios-formulas').length) {
      $('.owl-testimonios-formulas').owlCarousel({
        loop: false,
        navText: [
          '<i class="fa-solid fa-arrow-left"></i>',
          '<i class="fa-solid fa-arrow-right"></i>',
        ],
        rewind: true,
        autoplay: true,
        autoplayTimeout: 6000,
        autoplayHoverPause: true,
        autoHeight: false,
        dots: true,
        nav: false,
        responsive: {
          0: {
            items: 1,
            margin: 13
          },
          576: {
            items: 2,
            margin: 13
          },
          768: {
            items: 3,
            margin: 13
          },
          1280: {
            items: 4,
            margin: 21
          },
        },
      });
    };
  
    if($('.owl-testimonios-perdida-de-peso').length) {
      $('.owl-testimonios-perdida-de-peso').owlCarousel({
        loop: true,
        rewind: false,
        autoplay: true,
        autoplayTimeout: 5000,
        autoplaySpeed: 5000,
        autoplayHoverPause: false,
        autoHeight: false,
        dots: false,
        nav: false,
        smartSpeed: 5000,
        slideTransition: 'linear',
        mouseDrag: false,
        touchDrag: false,
        pullDrag: false,
        responsive: {
          0: {
            items: 2,
            margin: 13
          },
          576: {
            items: 2,
            margin: 13
          },
          768: {
            items: 3,
            margin: 13
          },
          1280: {
            items: 3,
            margin: 13
          },
        },
      });
    };
  
    if($('.owl-entidades').length) {
      $('.owl-entidades').owlCarousel({
        loop: false,
        navText: [
          '<i class="fa-solid fa-arrow-left"></i>',
          '<i class="fa-solid fa-arrow-right"></i>',
        ],
        rewind: true,
        autoplay: true,
        autoplayTimeout: 6000,
        autoplayHoverPause: true,
        autoHeight: false,
        dots: false,
        nav: false,
        responsive: {
          0: {
            items: 2,
            margin: 8
          },
          576: {
            items: 3,
            margin: 13
          },
          768: {
            items: 4,
            margin: 13
          },
          992: {
            items: 4,
            margin: 21
          },
          1280: {
            items: 4,
            margin: 34
          },
        },
      });
    };
  
    if($('.owl-certificates').length) {
      $('.owl-certificates').owlCarousel({
        loop: false,
        navText: [
          '<i class="fa-solid fa-arrow-left"></i>',
          '<i class="fa-solid fa-arrow-right"></i>',
        ],
        rewind: true,
        autoplay: true,
        autoplayTimeout: 6000,
        autoplayHoverPause: true,
        autoHeight: false,
        autoWidth: true,
        dots: false,
        nav: false,
        margin: 13
      });
    };
  
    if($('.owl-treatments').length) {
      $('.owl-treatments').owlCarousel({
        loop: false,
        navText: [
          '<i class="fa-solid fa-arrow-left"></i>',
          '<i class="fa-solid fa-arrow-right"></i>',
        ],
        rewind: true,
        autoplay: true,
        autoplayTimeout: 6000,
        autoplayHoverPause: true,
        autoHeight: false,
        autoWidth: true,
        dots: false,
        nav: false,
        responsive: {
          0: {
            margin: 34 
          },
          576: {
            margin: 34
          }
        },
      });
    };
  
    if($('.owl-testimonios-internacional').length) {
      $('.owl-testimonios-internacional').owlCarousel({
        loop: false,
        navText: [
          '<i class="fa-solid fa-arrow-left"></i>',
          '<i class="fa-solid fa-arrow-right"></i>',
        ],
        rewind: true,
        autoplay: true,
        autoplayTimeout: 6000,
        autoplayHoverPause: true,
        autoHeight: false,
        autoWidth: false,
        dots: false,
        nav: false,
        items: 1,
        responsive: {
          0: {
            margin: 13
          },
          576: {
            margin: 21
          }
        },
      });
    };
  
    if($('.owl-blogs').length) {
      $('.owl-blogs').owlCarousel({
        loop: true,
        margin: 20,
        nav: false,
        dots: true,
        autoplay: true,
        autoplayTimeout: 5000,
        autoplayHoverPause: true,
        responsive: {
          0: {
            items: 1,
            margin: 13,
          },
          768: {
            items: 3,
            margin: 13,
          },
          1024: {
            items: 3,
            margin: 13,
          }
        }
      });
    };
  
    if($('.carrusel-productos-shortcode').length) {
      $('.carrusel-productos-shortcode').owlCarousel({
        loop: false,
        rewind: true,
        margin: 2,
        nav: false,
        dots: true,
        autoplay: true,
        autoplayTimeout: 5000,
        autoplayHoverPause: true,
        autoHeight: true,
        responsive: {
          0: {
            items: 1,
            margin: 13,
          },
          576: {
            items: 2,
            margin: 13,
          },
          768: {
            items: 3,
            margin: 13,
          },
          1280: {
            items: 3,
            margin: 13,
          }
        }
      });
    };
  
    if($('.owl-hotels').length) {
      $('.owl-hotels').owlCarousel({
        loop: true,
        margin: 13,
        nav: false,
        dots: true,
        autoplay: true,
        autoplayTimeout: 6000,
        autoplayHoverPause: true,
        responsive: {
          0: {
            items: 1,
            margin: 13
          },
          768: {
            items: 3,
            margin: 21
          }
        }
      });
    };
  
    if($('.owl-implante-capilar').length) {
      $('.owl-implante-capilar').owlCarousel({
        loop: false,
        navText: [
          '<i class="fa-solid fa-arrow-left"></i>',
          '<i class="fa-solid fa-arrow-right"></i>',
        ],
        rewind: true,
        autoplay: true,
        autoplayTimeout: 6000,
        autoplayHoverPause: true,
        autoHeight: false,
        autoWidth: true,
        dots: false,
        nav: false,
        responsive: {
          0: {
            margin: 34
          }
        },
      });
    };
  
    if($('.owl-testimonios-internacional').length) {
      $('.owl-testimonios-internacional').owlCarousel({
        loop: true,
        margin: 21,
        nav: true,
        navText: [
          '<i class="fa-solid fa-arrow-left"></i>',
          '<i class="fa-solid fa-arrow-right"></i>',
        ],
        dots: false,
        autoplay: true,
        autoplayTimeout: 6000,
        autoplayHoverPause: true,
        responsive: {
          0: {
            items: 1,
            margin: 13
          },
          576: {
            items: 2,
            margin: 21
          },
          768: {
            items: 3,
            margin: 21
          },
          992: {
            items: 4,
            margin: 21
          }
        }
      });
    };
  
    if($('.owl-facial').length) {
      $('.owl-facial').owlCarousel({
        loop: false,
        navText: [
          '<i class="fa-solid fa-arrow-left"></i>',
          '<i class="fa-solid fa-arrow-right"></i>',
        ],
        rewind: true,
        autoplay: true,
        autoplayTimeout: 6000,
        autoplayHoverPause: true,
        autoHeight: false,
        autoWidth: true,
        dots: false,
        nav: false,
        responsive: {
          0: {
            margin: 13
          },
          576: {
            margin: 21
          }
        },
      });
    };
  
    if($('.owl-testimonios-facial').length) {
      $('.owl-testimonios-facial').owlCarousel({
        loop: false,
        navText: [
          '<i class="fa-solid fa-arrow-left"></i>',
          '<i class="fa-solid fa-arrow-right"></i>',
        ],
        rewind: true,
        autoplay: true,
        autoplayTimeout: 6000,
        autoplayHoverPause: true,
        autoHeight: false,
        autoWidth: true,
        dots: false,
        nav: false,
        responsive: {
          0: {
            margin: 13
          },
          576: {
            margin: 21
          }
        },
      });
    };
  
    if($('.owl-casos-exito').length) {
      $('.owl-casos-exito').owlCarousel({
        loop: true,
        margin:20,
        rewind: false,
        autoplay: true,
        autoHeight: false,
        dots: true,
        nav: false,
        slideTransition: 'linear',
        mouseDrag: true,
        touchDrag: true,
        pullDrag: true,
        responsive: {
          0: {
            items: 1,
            margin: 13
          },
          768: {
            items: 2,
            margin: 13
          },
          1280: {
            items: 2,
            margin: 13
          },
        },
      });
    };
  
    if($('.owl-hero-banner').length) {
      $('.owl-hero-banner').owlCarousel({
        loop: true,
        margin:20,
        rewind: false,
        autoplay: true,
        autoplayTimeout: 5000,
        autoplaySpeed: 5000,
        autoplayHoverPause: false,
        autoHeight: false,
        dots: false,
        nav: false,
        smartSpeed: 5000,
        slideTransition: 'linear',
        mouseDrag: false,
        touchDrag: false,
        pullDrag: false,
        responsive: {
          0: {
            items: 2,
            margin: 13
          },
          576: {
            items: 2,
            margin: 13
          },
          768: {
            items: 2,
            margin: 13
          },
          1280: {
            items: 2,
            margin: 13
          },
        },
      });
    };
  
    if($('.owl-sueroterapia').length) {
      $('.owl-sueroterapia').owlCarousel({
        loop: false,
        navText: [
          '<i class="fa-solid fa-arrow-left"></i>',
          '<i class="fa-solid fa-arrow-right"></i>',
        ],
        rewind: true,
        autoplay: true,
        autoplayTimeout: 6000,
        autoplayHoverPause: true,
        autoHeight: false,
        autoWidth: true,
        dots: false,
        nav: false,
        responsive: {
          0: {
            margin: 13
          },
          576: {
            margin: 21
          }
        },
      });
    };
  
    if($('.owl-testimonios-sueroterapia').length) {
      $('.owl-testimonios-sueroterapia').owlCarousel({
        loop: false,
        navText: [
          '<i class="fa-solid fa-arrow-left"></i>',
          '<i class="fa-solid fa-arrow-right"></i>',
        ],
        rewind: true,
        autoplay: true,
        autoplayTimeout: 6000,
        autoplayHoverPause: true,
        autoHeight: false,
        autoWidth: true,
        dots: false,
        nav: false,
        responsive: {
          0: {
            margin: 13
          },
          576: {
            margin: 21
          }
        },
      });
    };
  
    if($('.owl-testimonios-alopecia-mexico').length) {
      $('.prev-swiper-testimonios-alopecia-mexico').click(function() {
        owlTrigger('.owl-testimonios-alopecia-mexico', 'prev.owl.carousel');
      });
  
      $('.next-swiper-testimonios-alopecia-mexico').click(function() {
        owlTrigger('.owl-testimonios-alopecia-mexico', 'next.owl.carousel');
      });
  
      $('.owl-testimonios-alopecia-mexico').owlCarousel({
        loop: true,
        autoplay: true,
        autoplayTimeout: 6000,
        autoplayHoverPause: true,
        autoHeight: false,
        dots: false,
        nav: false,
        responsive: {
          0: {
            items: 1,
            margin: 13
          },
          576: {
            items: 2,
            margin: 13
          },
          768: {
            items: 3,
            margin: 13
          }
        }
      });
    };
  
    if($('.owl-evolucion-alopecia').length) {
      $('.owl-evolucion-alopecia').owlCarousel({
        loop: false,
        rewind: true,
        autoplay: false,
        autoplayTimeout: 6000,
        autoplayHoverPause: true,
        autoHeight: false,
        dots: false,
        nav: false,
        autoWidth: true,
        responsive: {
          0: {
            margin: 13,
            stagePadding: 10
          },
          576: {
            margin: 13,
            stagePadding: 30
          }
        }
      });
    };
  
    if($('.owl-testimonials-landing-mx').length) {
      $('.owl-testimonials-landing-mx').owlCarousel({
        loop: false,
        rewind: true,
        autoplay: true,
        autoplayTimeout: 6000,
        autoplayHoverPause: true,
        autoHeight: false,
        dots: false,
        nav: false,
        items: 1,
        margin: 20
      });
    };
  
    if($('.owl-testimonials-mobile').length) {
      $('.owl-testimonials-mobile').owlCarousel({
        margin: 16,
        loop: false,
        autoplay: false,
        nav: false,
        dots: false,
        autoWidth: true,
        rewind: true,
      });
  
      // Navegación personalizada con botones
      $('.prev-owl-testimonials-mobile').click(function() {
        owlTrigger('.owl-testimonials-mobile', 'prev.owl.carousel');
      });
  
      $('.next-owl-testimonials-mobile').click(function() {
        owlTrigger('.owl-testimonials-mobile', 'next.owl.carousel');
      });
    };
  
    if($('.owl-testimonials-desktop').length) {
      $('.owl-testimonials-desktop').owlCarousel({
        margin: 16,
        loop: false,
        autoplay: false,
        nav: false,
        dots: false,
        rewind: true,
        responsive: {
          992: {
            items: 3,
            margin: 20
          },
          1280: {
            items: 4,
            margin: 24
          },
        }
      });
  
      // Navegación personalizada con botones
      $('.prev-owl-testimonials-desktop').click(function() {
        owlTrigger('.owl-testimonials-desktop', 'prev.owl.carousel');
      });
  
      $('.next-owl-testimonials-desktop').click(function() {
        owlTrigger('.owl-testimonials-desktop', 'next.owl.carousel');
      });
    };
  
    if($('.owl-implantes-mobile').length) {
      $('.owl-implantes-mobile').owlCarousel({
        margin: 24,
        loop: false,
        autoplay: false,
        nav: false,
        dots: false,
        autoWidth: true,
        rewind: true,
      });
    };
  
    if($('.owl-implantes-desktop').length) {
      $('.owl-implantes-desktop').owlCarousel({
        margin: 24,
        loop: false,
        autoplay: false,
        nav: false,
        dots: false,
        rewind: true,
        responsive: {
          992: {
            items: 3,
            margin: 24
          },
        }
      });
  
      // Navegación personalizada con botones
      $('.prev-owl-implantes-desktop').click(function() {
        owlTrigger('.owl-implantes-desktop', 'prev.owl.carousel');
      });
  
      $('.next-owl-implantes-desktop').click(function() {
        owlTrigger('.owl-implantes-desktop', 'next.owl.carousel');
      });
    };

    if($('.owl-medicina-funcional-mobile').length) {
      $('.owl-medicina-funcional-mobile').owlCarousel({
        margin: 24,
        loop: false,
        autoplay: false,
        nav: false,
        dots: false,
        autoWidth: true,
        rewind: true,
      });
    };

    if($('.owl-medicina-funcional-desktop').length) {
      $('.owl-medicina-funcional-desktop').owlCarousel({
        margin: 24,
        loop: false,
        autoplay: false,
        nav: false,
        dots: false,
        rewind: true,
        responsive: {
          992: {
            items: 3,
            margin: 24
          },
        }
      });

      // Navegación personalizada con botones
      $('.prev-owl-medicina-funcional-desktop').click(function() {
        owlTrigger('.owl-medicina-funcional-desktop', 'prev.owl.carousel');
      });

      $('.next-owl-medicina-funcional-desktop').click(function() {
        owlTrigger('.owl-medicina-funcional-desktop', 'next.owl.carousel');
      });
    };

    // =============================================================
    // Medicina Alternativa (Cannabis Medicinal)
    // Carrusel "¿En qué condiciones puede ayudarte?"
    // =============================================================
    if($('.owl-medicina-alternativa-mobile').length) {
      $('.owl-medicina-alternativa-mobile').owlCarousel({
        margin: 24,
        loop: false,
        autoplay: false,
        nav: false,
        dots: false,
        autoWidth: true,
        rewind: true,
      });
    };

    if($('.owl-medicina-alternativa-desktop').length) {
      $('.owl-medicina-alternativa-desktop').owlCarousel({
        margin: 24,
        loop: false,
        autoplay: false,
        nav: false,
        dots: false,
        rewind: true,
        responsive: {
          992: {
            items: 3,
            margin: 24
          },
        }
      });

      // Navegación personalizada con botones
      $('.prev-owl-medicina-alternativa-desktop').click(function() {
        owlTrigger('.owl-medicina-alternativa-desktop', 'prev.owl.carousel');
      });

      $('.next-owl-medicina-alternativa-desktop').click(function() {
        owlTrigger('.owl-medicina-alternativa-desktop', 'next.owl.carousel');
      });
    };

    // Carrusel "Así trabajamos contigo" (proceso 4 pasos) - solo mobile
    if($('.owl-bienestar-alternativa-mobile').length) {
      $('.owl-bienestar-alternativa-mobile').owlCarousel({
        margin: 20,
        loop: false,
        autoplay: false,
        nav: false,
        dots: false,
        autoWidth: true,
        rewind: true,
      });
    };

    if($('.owl-bienestar-funcional-mobile').length) {
      $('.owl-bienestar-funcional-mobile').owlCarousel({
        margin: 20,
        loop: false,
        autoplay: false,
        nav: false,
        dots: false,
        autoWidth: true,
        rewind: true,
      });
    };

    if($('.owl-testimonios-funcional-mobile').length) {
      $('.owl-testimonios-funcional-mobile').owlCarousel({
        margin: 24,
        loop: false,
        autoplay: false,
        nav: false,
        dots: false,
        autoWidth: true,
        rewind: true,
      });
    };
  
    if($('.owl-testimonios-funcional-desktop').length) {
      $('.owl-testimonios-funcional-desktop').owlCarousel({
        margin: 24,
        loop: false,
        autoplay: false,
        nav: false,
        dots: false,
        rewind: true,
        responsive: {
          992: {
            items: 2,
            margin: 24
          },
        }
      });
  
      // Navegación personalizada con botones
      $('.prev-owl-testimonios-funcional-desktop').click(function() {
        owlTrigger('.owl-testimonios-funcional-desktop', 'prev.owl.carousel');
      });
  
      $('.next-owl-testimonios-funcional-desktop').click(function() {
        owlTrigger('.owl-testimonios-funcional-desktop', 'next.owl.carousel');
      });
    };

    if($('.owl-testimonios-dermatologia-mobile').length) {
      $('.owl-testimonios-dermatologia-mobile').owlCarousel({
        margin: 20,
        loop: false,
        autoplay: false,
        nav: false,
        dots: false,
        autoWidth: true,
        rewind: true,
      });
    };
  
    if($('.owl-testimonios-dermatologia-desktop').length) {
      $('.owl-testimonios-dermatologia-desktop').owlCarousel({
        margin: 20,
        loop: false,
        autoplay: false,
        nav: false,
        dots: false,
        rewind: true,
        draggable: false,
        touchDrag: false,
        mouseDrag: false,
        pullDrag: false,
        responsive: {
          992: {
            items: 3,
            margin: 20
          },
        }
      });
  
      // Navegación personalizada con botones
      $('.prev-owl-testimonios-dermatologia-desktop').click(function() {
        owlTrigger('.owl-testimonios-dermatologia-desktop', 'prev.owl.carousel');
      });
  
      $('.next-owl-testimonios-dermatologia-desktop').click(function() {
        owlTrigger('.owl-testimonios-dermatologia-desktop', 'next.owl.carousel');
      });
    };

    if($('.owl-innovacion-mobile').length) {
      $('.owl-innovacion-mobile').owlCarousel({
        margin: 20,
        loop: false,
        autoplay: false,
        nav: false,
        dots: false,
        autoWidth: true,
        rewind: true,
      });
    };
  
    if($('.owl-innovacion-desktop').length) {
      $('.owl-innovacion-desktop').owlCarousel({
        margin: 20,
        loop: false,
        autoplay: false,
        nav: false,
        dots: false,
        rewind: true,
        draggable: false,
        touchDrag: false,
        mouseDrag: false,
        pullDrag: false,
        responsive: {
          992: {
            items: 4,
            margin: 20
          },
        }
      });
  
      // Navegación personalizada con botones
      $('.prev-owl-innovacion-desktop').click(function() {
        owlTrigger('.owl-innovacion-desktop', 'prev.owl.carousel');
      });
  
      $('.next-owl-innovacion-desktop').click(function() {
        owlTrigger('.owl-innovacion-desktop', 'next.owl.carousel');
      });
    };

    if($('.owl-valoracion-dermatologia-mobile').length) {
      $('.owl-valoracion-dermatologia-mobile').owlCarousel({
        margin: 20,
        loop: false,
        autoplay: false,
        nav: false,
        dots: false,
        autoWidth: true,
        rewind: true,
      });
    };

    if($('.owl-how-it-works-mobile').length) {
      $('.owl-how-it-works-mobile').owlCarousel({
        margin: 24,
        loop: false,
        autoplay: false,
        nav: false,
        dots: false,
        autoWidth: true,
        rewind: true,
      });
    };
  
    if($('.owl-banners-shop').length) {
      $('.owl-banners-shop').owlCarousel({
        loop: false,
        autoplay: false,
        nav: false,
        dots: false,
        rewind: true,
        responsive: {
          0: {
            items: 1,
            margin: 16,
            autoWidth: true,
          },
          992: {
            items: 3,
            margin: 24,
            autoWidth: false,
          }
        }
      });
    };
  
    if($('.owl-habilidades-estrategicas-mobile').length) {
      $('.owl-habilidades-estrategicas-mobile').owlCarousel({
        margin: 16,
        loop: false,
        autoplay: false,
        nav: false,
        dots: false,
        autoWidth: true,
        rewind: true,
      });
  
      // Navegación personalizada con botones
      $('.prev-owl-habilidades-estrategica-mobile').click(function() {
        owlTrigger('.owl-habilidades-estrategicas-mobile', 'prev.owl.carousel');
      });
  
      $('.next-owl-habilidades-estrategica-mobile').click(function() {
        owlTrigger('.owl-habilidades-estrategicas-mobile', 'next.owl.carousel');
      });
    };
  
    if($('.owl-habilidades-estrategicas-desktop').length) {
      $('.owl-habilidades-estrategicas-desktop').owlCarousel({
        margin: 16,
        loop: false,
        autoplay: false,
        nav: false,
        dots: false,
        rewind: true,
        responsive: {
          992: {
            items: 3,
            margin: 16
          },
        }
      });
  
      // Navegación personalizada con botones
      // (apuntaban a .owl-testimonials-desktop por un copy-paste: movían el
      //  carrusel de testimonios del home en vez de este)
      $('.prev-owl-habilidades-estrategicas-desktop').click(function() {
        owlTrigger('.owl-habilidades-estrategicas-desktop', 'prev.owl.carousel');
      });

      $('.next-owl-habilidades-estrategicas-desktop').click(function() {
        owlTrigger('.owl-habilidades-estrategicas-desktop', 'next.owl.carousel');
      });
    };

    if($('.owl-equipo-investigacion').length) {
      $('.owl-equipo-investigacion').owlCarousel({
        margin: 24,
        loop: false,
        autoplay: false,
        nav: false,
        dots: false,
        autoWidth: true,
        rewind: true,
      });
  
      // Navegación personalizada con botones
      $('.prev-owl-equipo-investigacion').click(function() {
        owlTrigger('.owl-equipo-investigacion', 'prev.owl.carousel');
      });
  
      $('.next-owl-equipo-investigacion').click(function() {
        owlTrigger('.owl-equipo-investigacion', 'next.owl.carousel');
      });
    };

    if($('.owl-titles-home').length) {
      $('.owl-titles-home').owlCarousel({
        loop: false,
        nav: false,
        navText: ['', ''], // sin «‹›»: Owl mete los botones aunque nav sea false, y quedaban dentro del H1
        dots: false,
        rewind: true,
        items: 1,
        autoplay: true,
        autoplayTimeout: 6000,
        mouseDrag: false,
        touchDrag: false,
        pullDrag: false,
        autoplayHoverPause: false,
        smartSpeed: 5000,
        slideTransition: 'linear',
        animateIn: 'animate__animated animate__fadeInRight',
        animateOut: 'animate__animated animate__fadeOutLeft',
      });
    };
  };

  function initIsotope() {
    if($('.buttons-filter-testimonies').length) {
      var $grid = $('.isotope');
      $grid.isotope({
        itemSelector: '.element-item',
        layoutMode: 'fitRows',
        percentPosition: true,
      });
      $('.filter-button').on('click', function() {
        $('.filter-button').removeClass('active');
        $(this).addClass('active');
        var filterValue = $(this).attr('data-filter');
        $grid.isotope({ filter: filterValue });
      });
    };
  };

  function initWhenjQueryReady() {
    if(typeof jQuery === 'undefined' || !jQuery.fn) {
      setTimeout(initWhenjQueryReady, 50);
      return;
    };
    
    const needsOwl = jQuery('.owl-cross-sells, .owl-testimonies-product, .owl-testimonies-financial, .owl-kits-financial, .owl-blogs-nutricion, .owl-productos-mexico, .owl-weight-loss-testimonies, .owl-weight-testimonies, .owl-testimonios-financial, .owl-testimonios-examenes, .owl-testimonios-formulas, .owl-testimonios-perdida-de-peso, .owl-entidades, .owl-hero-banner, .owl-sueroterapia, .owl-testimonios-sueroterapia, .owl-testimonios-alopecia-mexico, .owl-evolucion-alopecia, .owl-testimonials-landing-mx, .owl-testimonials-mobile, .owl-testimonials-desktop, .owl-implantes-mobile, .owl-implantes-desktop, .owl-banners-shop, .owl-habilidades-estrategicas-mobile, .owl-habilidades-estrategicas-desktop, .owl-titles-home, .owl-bienestar-funcional-mobile, .owl-bienestar-funcional-desktop, .owl-medicina-funcional-mobile, .owl-medicina-funcional-desktop, .owl-testimonios-funcional-mobile, .owl-testimonios-funcional-desktop, .owl-medicina-alternativa-mobile, .owl-medicina-alternativa-desktop, .owl-bienestar-alternativa-mobile, .owl-testimonios-dermatologia-mobile, .owl-testimonios-dermatologia-desktop, .owl-innovacion-mobile, .owl-innovacion-desktop, .owl-valoracion-dermatologia-mobile').length > 0;
    const needsPignoseCalendar = jQuery('#calendar-custom, #calendar-sidebar-diagnosis, #calendar-sidebar-diagnosis-general').length > 0;
    const needsIsotope = jQuery('.buttons-filter-testimonies').length > 0;

    loadMainDependencies(function() {
      jQuery(document).ready(function($) {
        if(needsOwl) {
          loadOwlCarousel(function() {
            initComponents($);
            // Si también se necesita pignoseCalendar, cargarlo
            if(needsPignoseCalendar && typeof $.fn.pignoseCalendar !== "function") {
              loadPignoseCalendar(function() {
                setTimeout(function() {
                  if(typeof window.tryInitCalendarDiagnosis === "function") window.tryInitCalendarDiagnosis();
                  if($('#calendar-sidebar-diagnosis-general').length && typeof window.tryInitCalendarDiagnosisGeneral === "function") window.tryInitCalendarDiagnosisGeneral();
                }, 200);
              });
            } else if(needsPignoseCalendar) {
              setTimeout(function() {
                if(typeof window.tryInitCalendarDiagnosis === "function") window.tryInitCalendarDiagnosis();
                if($('#calendar-sidebar-diagnosis-general').length && typeof window.tryInitCalendarDiagnosisGeneral === "function") window.tryInitCalendarDiagnosisGeneral();
              }, 200);
            }
          });

          if(needsIsotope) {
            loadIsotope(function() {
              initIsotope();
            });
          }
        } else if(needsPignoseCalendar) {
          loadPignoseCalendar(function() {
            initComponents($);
            setTimeout(function() {
              if(typeof window.tryInitCalendarDiagnosis === "function") window.tryInitCalendarDiagnosis();
              if($('#calendar-sidebar-diagnosis-general').length && typeof window.tryInitCalendarDiagnosisGeneral === "function") window.tryInitCalendarDiagnosisGeneral();
            }, 200);
          });

          if(needsIsotope) {
            loadIsotope(function() {
              initIsotope();
            });
          }
        } else {
          initComponents($);
          // Si se necesita pignoseCalendar pero no se detectó antes, intentar cargarlo
          if($('#calendar-sidebar-diagnosis').length && typeof $.fn.pignoseCalendar !== "function") {
            loadPignoseCalendar(function() {
              setTimeout(function() {
                if(typeof window.tryInitCalendarDiagnosis === "function") window.tryInitCalendarDiagnosis();
                if($('#calendar-sidebar-diagnosis-general').length && typeof window.tryInitCalendarDiagnosisGeneral === "function") window.tryInitCalendarDiagnosisGeneral();
              }, 200);
            });
          } else if($('#calendar-sidebar-diagnosis').length) {
            setTimeout(function() {
              if(typeof window.tryInitCalendarDiagnosis === "function") window.tryInitCalendarDiagnosis();
              if($('#calendar-sidebar-diagnosis-general').length && typeof window.tryInitCalendarDiagnosisGeneral === "function") window.tryInitCalendarDiagnosisGeneral();
            }, 200);
          }

          if(needsIsotope) {
            loadIsotope(function() {
              initIsotope();
            });
          }
        }
      });
    });
  };

  initWhenjQueryReady();
})();

/* ==================================================================
 * Teléfono del formulario de cita → campo del checkout
 *
 * Cuando la cita se cobra, el formulario redirige al checkout con
 * ?bulk-add=... El handler de PHP arma el carrito y termina en
 * wp_safe_redirect( wc_get_checkout_url() ), o sea que la URL final
 * llega LIMPIA: nada que se mande por querystring sobrevive ese salto.
 * Mandarlo igual tendría además el costo de dejar el número escrito en
 * los logs del servidor y del CDN.
 *
 * Por eso el traspaso va por sessionStorage: se guarda el número
 * mientras lo escriben en el formulario y se copia al campo del
 * checkout al llegar. Vive solo en esa pestaña y no viaja por la red.
 *
 * Se guarda SIN indicativo a propósito. Los dos checkouts piden el
 * número nacional (el campo se llama "Teléfono (sin indicativo)") y en
 * rogansya.com además se valida contra [0-9]{10,}: un "+57" al frente
 * haría fallar el pago.
 *
 * Va en un solo lugar y no en cada formulario porque hay ~20 páginas
 * por sitio que redirigen al checkout, y todas comparten el mismo par
 * de controles: un input de teléfono y el selector de bandera
 * input[name="country_flag"].
 * ================================================================== */
(function () {
  'use strict';

  var CLAVE = 'rogansTelefonoCita';
  // El número nacional más corto que se maneja (Panamá y varios de
  // Centroamérica son de 7-8 dígitos).
  var MIN_DIGITOS = 7;

  function soloDigitos(valor) {
    return String(valor || '').replace(/\D/g, '');
  }

  /**
   * ¿Es un campo de teléfono?
   *
   * Se filtra por nombre y no por type="tel" a secas porque el tema usa
   * ese type en dos campos que NO son teléfonos: #document (la cédula)
   * y #pago_mensual (el valor de la cuota en la landing de financiación).
   * Guardar cualquiera de esos como teléfono llevaría una cédula al
   * checkout.
   */
  function esCampoTelefono(input) {
    if (!input || input.tagName !== 'INPUT' || input.type !== 'tel') return false;
    if (input.id === 'billing_phone') return false; // el del propio checkout
    return /phone|telefono/i.test((input.id || '') + ' ' + (input.name || ''));
  }

  /**
   * Indicativo elegido en el selector de bandera que acompaña al input.
   * El data-name de la opción trae el país con el código: "Colombia (+57)".
   * Se busca de adentro hacia afuera para no tomar el de otro formulario
   * de la misma página (varias landings tienen el de captura y el de
   * agendamiento a la vez).
   */
  function indicativoDe(input) {
    var ambitos = [
      input.closest('.custom-select-image'),
      input.closest('form'),
      document
    ];
    for (var i = 0; i < ambitos.length; i++) {
      if (!ambitos[i]) continue;
      var radio = ambitos[i].querySelector('input[name="country_flag"]:checked');
      if (!radio) continue;
      var opcion = radio.closest('.custom-select-image-option');
      var nombre = opcion ? (opcion.getAttribute('data-name') || '') : '';
      var m = nombre.match(/\((\+?\d+)\)/);
      if (m) return m[1].replace('+', '');
    }
    return '';
  }

  /**
   * Quita el indicativo cuando el usuario lo escribió o lo pegó pegado al
   * número. Solo recorta si lo que queda sigue siendo un número plausible,
   * para no mutilar uno que legítimamente empiece con esos dígitos.
   */
  function sinIndicativo(digitos, codigo) {
    if (!codigo || digitos.indexOf(codigo) !== 0) return digitos;
    var resto = digitos.slice(codigo.length);
    return resto.length >= MIN_DIGITOS ? resto : digitos;
  }

  function guardarTelefono(e) {
    var input = e.target;
    if (!esCampoTelefono(input)) return;
    var numero = sinIndicativo(soloDigitos(input.value), indicativoDe(input));
    if (numero.length < MIN_DIGITOS) return;
    // En navegación privada o con las cookies bloqueadas esto lanza; el
    // prellenado es una comodidad, así que se ignora en silencio.
    try { sessionStorage.setItem(CLAVE, numero); } catch (err) {}
  }

  function rellenarCheckout() {
    var campo = document.getElementById('billing_phone');
    if (!campo) return;                       // no estamos en el checkout
    if (campo.value.trim() !== '') return;    // ya viene con dato: no se pisa

    var numero = '';
    try { numero = sessionStorage.getItem(CLAVE) || ''; } catch (err) {}
    if (numero.length < MIN_DIGITOS) return;

    campo.value = numero;
    // WooCommerce y las validaciones del tema reaccionan a estos eventos;
    // sin ellos el campo queda lleno pero el botón de pagar sigue creyendo
    // que está vacío.
    campo.dispatchEvent(new Event('input', { bubbles: true }));
    campo.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // En captura: algunos formularios detienen la propagación del evento.
  document.addEventListener('input', guardarTelefono, true);
  document.addEventListener('change', guardarTelefono, true);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', rellenarCheckout);
  } else {
    rellenarCheckout();
  }
})();
