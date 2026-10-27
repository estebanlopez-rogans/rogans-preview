(function () {
  'use strict';

  /** Odoo /webhook/agenda vía admin-ajax (evita CORS). Config: window.RogansOdooAgenda (wp_localize_script jquery). */
  (function (w) {
    function buildOdooAgendaPayload(datosAgendamiento) {
      var d = datosAgendamiento || {};
      var type = d.tipo != null ? String(d.tipo) : '';
      var telefono = d.telefono != null ? String(d.telefono) : '';
      var nombre = d.nombre != null ? String(d.nombre) : '';
      var email = d.email != null ? String(d.email) : '';
      var comentario = d.comentario != null ? String(d.comentario) : '';
      var utm = d.utm != null ? String(d.utm) : '';
      if (type === 'captura') {
        var captura = { tipo: type, telefono: telefono, nombre: nombre, email: email, comentario: comentario, utm: utm };
        // 'fuente' es opcional (hoy solo lo manda el diagnóstico capilar v2); se
        // omite si viene vacío para no alterar el payload de los formularios ya existentes.
        if (d.fuente != null && String(d.fuente) !== '') captura.fuente = String(d.fuente);
        return captura;
      }
      return {
        tipo: type,
        telefono: telefono,
        nombre: nombre,
        email: email,
        fecha_inicio: d.fecha_inicio != null ? String(d.fecha_inicio) : '',
        modalidad: d.modalidad != null ? String(d.modalidad) : '',
        tipo_cita: d.tipo_cita != null ? String(d.tipo_cita) : '',
        comentario: comentario,
        utm: utm
      };
    }

    /**
     * Nonce nuevo, sin caché (admin-ajax rogans_nonce_odoo_agenda), para cuando el de la página
     * venció: la página quedó abierta muchas horas o la caché la sirvió vieja. Actualiza
     * window.RogansOdooAgenda.nonce y lo devuelve.
     */
    function nonceFresco() {
      var cfg = w.RogansOdooAgenda || {};
      if (!cfg.ajaxUrl) {
        return Promise.reject(new Error('RogansOdooAgenda no está configurado'));
      }
      var body = new URLSearchParams();
      body.set('action', 'rogans_nonce_odoo_agenda');
      return fetch(cfg.ajaxUrl, {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
        body: body.toString()
      }).then(function (res) {
        return res.json();
      }).then(function (json) {
        if (!json || !json.success || !json.data || !json.data.nonce) {
          throw new Error('No se pudo renovar el nonce');
        }
        cfg.nonce = json.data.nonce;
        return cfg.nonce;
      });
    }

    /** ¿El proxy rechazó el envío porque el nonce venció? (código nonce_vencido en functions.php) */
    function nonceVencido(json) {
      return !!(json && json.success === false && json.data
        && (json.data.code === 'nonce_vencido' || json.data.message === 'Error de seguridad'));
    }

    function postOdooAgendaProxy(fields) {
      var cfg = w.RogansOdooAgenda;
      if (!cfg || !cfg.ajaxUrl || !cfg.nonce) {
        return Promise.reject(new Error('RogansOdooAgenda no está configurado'));
      }
      var payload = buildOdooAgendaPayload(fields);

      function enviar(nonce) {
        var body = new URLSearchParams();
        body.set('action', cfg.action || 'proxy_odoo_agenda_webhook');
        body.set('nonce', nonce);
        body.set('payload', JSON.stringify(payload));
        return fetch(cfg.ajaxUrl, {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
          body: body.toString()
        }).then(function (res) {
          return res.text().then(function (text) {
            var json = null;
            if (text) {
              try {
                json = JSON.parse(text);
              } catch (e) {
                json = { success: false, data: { message: text } };
              }
            }
            return json;
          });
        });
      }

      function interpretar(json) {
        if (!json || !json.success) {
          var msg = 'Error al enviar a Odoo';
          if (json && json.data) {
            if (typeof json.data === 'string') msg = json.data;
            else if (json.data.message) msg = json.data.message;
          }
          return { status: 502, response: { error: msg } };
        }
        return json.data;
      }

      return enviar(cfg.nonce).then(function (json) {
        if (!nonceVencido(json)) return interpretar(json);
        // El nonce de la página venció: se pide uno nuevo y se reintenta UNA vez.
        return nonceFresco().then(enviar).then(interpretar, function () {
          return interpretar(json);
        });
      });
    }

    w.RogansOdooAgendaApi = {
      buildPayload: buildOdooAgendaPayload,
      post: postOdooAgendaProxy,
      nonceFresco: nonceFresco,
      nonceVencido: nonceVencido
    };
  })(window);

  function showBody() {
    // Mismo criterio que en js/main.js: el preloader (inc/preloader.php) es
    // quien destapa el body; lo de abajo es respaldo.
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

  function ensureNiceSelect($) {
    return new Promise(function (resolve, reject) {
      if ($ && $.fn && $.fn.niceSelect) { resolve(); return; }

      var head = document.head || document.getElementsByTagName('head')[0];
      var css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = URL_TEMPLATE + '/css/nice-select.min.css?v=' + Date.now();
      head.appendChild(css);

      var js = document.createElement('script');
      js.src = URL_TEMPLATE + '/js/nice-select.min.js?v=' + Date.now();
      js.onload = function () {
        if ($ && $.fn && $.fn.niceSelect) resolve();
        else reject(new Error('niceSelect no se adjuntó a jQuery'));
      };
      js.onerror = reject;
      head.appendChild(js);
    });
  };

  function ensureNoUiSlider() {
    return new Promise(function (resolve, reject) {
      if (window.noUiSlider) { resolve(); return; }
  
      var head = document.head;
      var link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = URL_TEMPLATE + '/css/nouislider.min.css?v=' + Date.now();
      head.appendChild(link);
  
      var script = document.createElement('script');
      script.src = URL_TEMPLATE + '/js/nouislider.min.js?v=' + Date.now();
      script.onload = function(){ window.noUiSlider ? resolve() : reject(new Error('noUiSlider no disponible')); };
      script.onerror = reject;
      head.appendChild(script);
    });
  };

  function loaderSpinnerProducts(text = 'Cargando productos') {
    return `
    <div class="loader-products">
      <span class="loading-icon"></span>

      <p class="label-text">${text}</p>
    </div>
    `;
  };

  function loaderSpinnerCustom(text = 'Cargando blog', clase = '') {
    return `
    <div class="${clase}">
      <span class="loading-icon"></span>

      <p class="label-text">${text}</p>
    </div>
    `;
  };

  function initComponents($) {
    var show_loader = true;
    var first_load = false;

    function applyNiceSelect() {
      if($.fn && $.fn.niceSelect) {
        $('.custom-nice-select, .variations select').each(function () {
          var $sel = $(this);
          if($sel.next('.nice-select').length) {
            $sel.niceSelect('update');
          } else {
            $sel.niceSelect();
          }
        });
      }
    };

    function openSidebarCart() {
      $('html').addClass('overflow-hidden');
      $('body').addClass('overflow-hidden');
      $('.sidebar-cart').addClass('active');
      $('.overlay-sidebar-cart, .overlay-cart').addClass('active');
    };

    function closeSidebarCart() {
      $('html').removeClass('overflow-hidden');
      $('body').removeClass('overflow-hidden');
      $('.sidebar-cart').removeClass('active');
      $('.overlay-sidebar-cart, .overlay-cart').removeClass('active');
    };

    $(document).on('click', '.open-sidebar-cart, .toggle-sidebar-cart', function(e) {
      e.preventDefault();
      openSidebarCart();
    });

    $(document).on('click', '.overlay-sidebar-cart, .overlay-cart, .close-sidebar-cart', function(e) {
      e.preventDefault();
      closeSidebarCart();
    });

    // Scroll to div
    function scrollToDiv(divId) {
      var target = $('#' + divId);
      if (target.length) {
        $('html, body').animate({
          scrollTop: target.offset().top
        }, 1000); // 1000 milisegundos = 1 segundo
      }
    };

    // Tienda
    function loadProducts(page = 1, category = '', min_price = 50, max_price = 10000000, orderby = 'menu_order', keyword = '') {

      if(show_loader) {
        $('#contentProducts').html(loaderSpinnerProducts('Cargando productos'));
      }

      $.ajax({
        url: URL_AJAX,
        type: 'POST',
        data: {
          action: 'load_woocommerce_products',
          page: page,
          category: category,
          min_price: min_price,
          max_price: max_price,
          keyword: keyword,
          orderby: orderby
        },
        success: function(response) {
          if(response.success) {
            $("#contentProducts").html(response.data.products);

            if(response.data.pagination) {
              $("#contentProducts").append(
                `<div class="row-last-shop">
                  <p id="product-count" class="woocommerce-result-count"></p>

                  <div class="pagination">${response.data.pagination.join('')}</div>
                </div>`
              );
            }

            // Mostrar la cantidad de productos
            $("#product-count").text(
              `Mostrando ${response.data.start} - ${response.data.end} de ${response.data.total_products} productos`
            );

            if($('.product .attachment-woocommerce_thumbnail').length) {
              $('.product .attachment-woocommerce_thumbnail').each(function() {
                $(this).wrap('<div class="content-product-image"></div>');
              });
            };
          } else {
            $("#contentProducts").html('<p class="products-not-found">No hay resultados para tu búsqueda</p>');
          }

          applyNiceSelect();
          show_loader = true;

          $('.sidebar-filters').addClass('translate-x-full opacity-0 invisible');
          $('body').removeClass('overflow-x-hidden');
        },
        error: function(response) {
          // Ocultar el indicador de carga en caso de error
          $("#loading").addClass("invisible opacity-0 -z-[99999]").removeClass("visible opacity-100 z-[99999]");
          $("body").removeClass("overflow-hidden");
          $("#contentProducts").html('<p class="products-not-found">No hay resultados para tu búsqueda</p>');

          $('.sidebar-filters').addClass('translate-x-full opacity-0 invisible');
          $('body').removeClass('overflow-x-hidden');
        },
      });
    };

    // Archive
    function loadArchivePosts(
      page = 1,
      taxonomy = "",
      term_id = 0,
      min_price = 50,
      max_price = 10000000,
      orderby = "menu_order"
    ) {
      $("#loading").removeClass("invisible opacity-0 -z-[99999]").addClass("visible opacity-100 z-[99999]");
      $("body").addClass("overflow-hidden");

      $.ajax({
        url: URL_AJAX,
        type: "POST",
        data: {
          action: "load_archive_posts",
          page: page,
          taxonomy: taxonomy,
          term_id: term_id,
          min_price: min_price,
          max_price: max_price,
          orderby: orderby,
        },
        success: function(response) {
          $("#loading").addClass("invisible opacity-0 -z-[99999]").removeClass("visible opacity-100 z-[99999]");
          $("body").removeClass("overflow-hidden");

          if(response.success) {
            $("#archive-posts").html(response.data.posts);

            if (response.data.pagination) {
              $("#archive-posts").append(
                '<div class="pagination">' +
                  response.data.pagination.join('') +
                '</div>'
              );
            }

            // Mostrar la cantidad de productos
            $("#product-count").text(
              `Mostrando ${response.data.start}–${response.data.end} de ${response.data.total_products} productos`
            );
          } else {
            $("#archive-posts").html('<p class="products-not-found">No hay resultados para tu búsqueda</p>');
          }

          $('.sidebar-filters').addClass('translate-x-full opacity-0 invisible');
          $('body').removeClass('overflow-x-hidden');
        },
        error: function () {
          $("#loading").addClass("invisible opacity-0 -z-[99999]").removeClass("visible opacity-100 z-[99999]");
          $("body").removeClass("overflow-hidden");
          $("#archive-posts").html('<p class="products-not-found">No hay resultados para tu búsqueda</p>');
          $("#pagination").html("");

          $('.sidebar-filters').addClass('translate-x-full opacity-0 invisible');
          $('body').removeClass('overflow-x-hidden');
        },
      });
    };

    // Blog
    var current_page_blog = 1;
    var current_keyword_blog = '';
    var max_pages_blog = 1;

    function loadBlogMain(category = '', keyword = '', page = 1, append = false) {
      // Si es una nueva búsqueda/filtro, resetear página
      if (!append) {
        current_page_blog = page;
        current_keyword_blog = keyword;
      }

      if(!first_load && !append) {
        $('#blog-main').html(loaderSpinnerCustom('Cargando blog principal', 'blog-main-loader'));
        $('#blog-list').html(loaderSpinnerCustom('Cargando blogs', 'blog-list-loader'));
      } else if (!append) {
        $('#blog-main').addClass('loading');
        $('#blog-list').addClass('loading');
      } else {
        // Si estamos agregando, solo mostrar loading en el botón
        $('.load-more-blogs').prop('disabled', true).html(`
          <span>Cargando...</span>
          <span class="flex items-center justify-center w-5 h-5 flex-none">
            <i data-lucide="loader-2" class="animate-spin"></i>
          </span>
        `);
      }
      
      first_load = true;
            
      if (!append) {
        $('html, body').animate({
          scrollTop: $('#blog-main').offset().top - 100
        }, 500);
      }

      $('.filter-category').attr('disabled', true);

      // En la primera página cargar 13 (1 main + 12 blogs), en las demás 12
      const perPage = (current_page_blog === 1 && !append) ? 13 : 12;

      const ajaxData = {
        action: 'load_custom_posts',
        post_type: 'post',
        per_page: perPage,
        page: current_page_blog,
        taxonomy: 'category',
        terms: category ? category : '',
      };

      // Agregar keyword si existe
      if (keyword && keyword.length >= 3) {
        ajaxData.keyword = keyword;
      }

      $.ajax({
        url: URL_AJAX,
        type: 'POST',
        data: ajaxData,
        success: function(response) {
          $('#blog-main').removeClass('loading');
          $('#blog-list').removeClass('loading');

          let main = null;
          let blogs = [];
          const posts = response.data.posts;
          max_pages_blog = response.data.max_pages || 1;

          if(posts && Array.isArray(posts) && posts.length > 0) {
            // Solo mostrar el main en la primera página
            if (current_page_blog === 1 && !append) {
              main = posts[0];
              blogs = posts.slice(1);
            } else {
              // En páginas siguientes, todos son blogs
              blogs = posts;
            }

            if(main && !append) {
              $('#blog-main').html(
                `
                <article class="bg-white overflow-hidden rounded-3xl flex flex-col md:flex-row">
                  <div class="relative pt-[75%] md:pt-0 w-full flex-none md:w-1/2 lg:max-w-xl">
                    <img src="${main.thumbnail}" alt="Blog | ${main.title}" title="Blog | ${main.title}" class="absolute top-0 left-0 z-0 h-full w-full object-cover object-center" loading="lazy">

                    ${main.categories && main.categories.length > 0 ? `<span class="absolute z-20 top-6 right-6 bg-primary-100 rounded-2xl text-primary-950 py-0.5 px-2 text-sm leading-auto font-medium">${main.categories[0].name}</span>` : ''}
                  </div>
                  <div class="flex-auto md:flex-none md:w-1/2 lg:flex-auto p-5 sm:p-7 md:p-9 lg:py-12 lg:px-10">
                    <a href="${main.permalink}" title="Ir a ${main.title}" class="block"><h2 class="line-clamp-3 lg:line-clamp-2 text-gray-950 text-lg lg:text-2xl font-semibold leading-auto transition-all duration-300 hover:text-primary-500">${main.title}</h2></a>

                    ${main.excerpt ? `<p class="mt-2 text-gray-600 text-base font-normal leading-auto line-clamp-3">${main.excerpt}</p>` : ''}
                    
                    ${main.author ? `<div class="mt-4 flex items-center gap-x-3">
                      ${main.author_avatar || main.author === 'AdminRogans' ? `<div class="w-11 h-11 rounded-full overflow-hidden flex-none">
                        <img src="${main.author === 'AdminRogans' ? URL_TEMPLATE + '/images/equipo-medico-rogans.svg' : main.author_avatar}" alt="${main.author}" title="${main.author}" class="w-full h-full object-cover object-center" loading="lazy">
                      </div>` : ''}
                      <div class="flex-auto">
                        <p class="text-gray-400 text-sm leading-auto">Autor</p>
                        <p class="text-gray-950 font-semibold text-sm leading-auto">${main.author === 'AdminRogans' ? 'Equipo Médico de Rogans' : main.author}</p>
                      </div>
                    </div>
                    ` : ''}

                    <a href="${main.permalink}" title="Ir a ${main.title}" class="mt-6 whitespace-nowrap bg-primary-500 text-primary-950 flex items-center justify-center gap-x-2 text-base leading-5 font-bold rounded-xl px-5 py-3 transition-all duration-300 hover:bg-primary-950 hover:text-white lg:max-w-max lg:ml-auto">
                      Leer más
                      <span class="flex-none w-5 h-5 flex items-center justify-center">
                        <i class="fa-solid fa-chevron-right"></i>
                      </span>
                    </a>
                  </div>
                </article>
                `
              );
            }

            if(blogs && Array.isArray(blogs) && blogs.length > 0) {
              const blogsHTML = blogs.map(function(blog) {
                  return `
                  <article class="w-full col-span-full sm:col-span-3 lg:col-span-2 overflow-hidden rounded-xl relative flex flex-col bg-white">
                    <div class="relative pt-[75%] w-full flex-none">
                      <img src="${blog.thumbnail}" alt="Blog | ${blog.title}" title="Blog | ${blog.title}" class="absolute top-0 left-0 z-0 w-full h-full object-cover object-center" loading="lazy">

                      ${blog.categories && blog.categories.length > 0 ? `<span class="absolute z-20 top-6 right-6 bg-primary-100 rounded-2xl text-primary-950 py-0.5 px-2 text-sm leading-auto font-medium">${blog.categories[0].name}</span>` : ''}
                    </div>
                    <div class="flex-auto flex flex-col gap-y-4 p-5">
                      <div class="w-full flex-auto">
                        <a href="${blog.permalink}" title="Ir a ${blog.title}" class="block"><h3 class="line-clamp-3 text-gray-950 text-lg font-semibold leading-auto transition-all duration-300 hover:text-primary-500">${blog.title}</h3></a>

                        ${blog.excerpt ? `<p class="mt-2 text-gray-600 text-sm font-normal leading-auto line-clamp-5">${blog.excerpt}</p>` : ''}
                      </div>

                      <div class="w-full flex-none">
                        <a href="${blog.permalink}" title="Ir a ${blog.title}" class="whitespace-nowrap hover:bg-primary-500 hover:text-white flex items-center justify-center gap-x-2 text-base leading-5 font-bold rounded-xl px-5 py-3 transition-all duration-300 bg-gray-950 text-white">
                          Leer más
                          <span class="flex-none w-5 h-5 flex items-center justify-center">
                            <i class="fa-solid fa-chevron-right"></i>
                          </span>
                        </a>
                      </div>
                    </div>
                  </article>
                  `;
                }).join('');

              if (append) {
                // Si estamos agregando, hacer append
                $('#blog-list').append(blogsHTML);
              } else {
                // Si es nueva carga, reemplazar
                $('#blog-list').html(blogsHTML);
              }
            }

            // Manejar estado del botón "Cargar más"
            if (current_page_blog >= max_pages_blog) {
              $('.load-more-blogs').prop('disabled', true).html(`
                No hay más blogs
                <span class="flex items-center justify-center w-5 h-5 flex-none">
                  <i data-lucide="check"></i>
                </span>
              `);
            } else {
              $('.load-more-blogs').prop('disabled', false).html(`
                Cargar más
                <span class="flex items-center justify-center w-5 h-5 flex-none">
                  <i data-lucide="rotate-cw"></i>
                </span>
              `);
            }

            // Reinicializar iconos de Lucide
            if (typeof lucide !== 'undefined' && lucide.createIcons) {
              lucide.createIcons();
            }
          } else if (!append) {
            // Solo mostrar mensaje si no hay posts y no estamos agregando
            $('#blog-list').html('<p class="col-span-full text-center py-10 text-gray-600">No hay blogs disponibles</p>');
            $('.load-more-blogs').prop('disabled', true).html(`
              No hay blogs
              <span class="flex items-center justify-center w-5 h-5 flex-none">
                <i data-lucide="x"></i>
              </span>
            `);
            if (typeof lucide !== 'undefined' && lucide.createIcons) {
              lucide.createIcons();
            }
          }

          // Siempre remover disabled de los filtros después de cargar
          $('.filter-category').removeAttr('disabled');
        },
        error: function() {
          if (!append) {
            $('#blog-main').removeClass('loading');
            $('#blog-list').removeClass('loading');
            $('#blog-main').html('<p class="text-center py-10 text-error-600">Error al cargar los blogs</p>');
            $('#blog-list').html('');
          }
          $('.load-more-blogs').prop('disabled', false).html(`
            Cargar más
            <span class="flex items-center justify-center w-5 h-5 flex-none">
              <i data-lucide="rotate-cw"></i>
            </span>
          `);
          if (typeof lucide !== 'undefined' && lucide.createIcons) {
            lucide.createIcons();
          }
          $('.filter-category').removeAttr('disabled');
        }
      });
    };

    if($('#blog-main').length || $('#blog-list').length) {
      var category_blog = '';

      loadBlogMain();

      // Botón cargar más
      $('body').on('click', '.load-more-blogs', function(e) {
        e.preventDefault();
        if ($(this).prop('disabled')) return;
        
        current_page_blog++;
        loadBlogMain(category_blog, current_keyword_blog, current_page_blog, true);
      });

      $('body').on('click', '.filter-category', function(e) {
        e.preventDefault();
        var category = $(this).data('category');
        
        // Verificar si YA tiene la clase active ANTES de agregarla
        if($(this).hasClass('active')) {
          // Si ya está activa, desactivarla y cargar sin filtro
          $('.filter-category').removeClass('active');
          category_blog = '';
          current_page_blog = 1;
          current_keyword_blog = '';
          loadBlogMain('', '', 1, false);
        } else {
          // Si no está activa, activarla y cargar con filtro
          $('.filter-category').removeClass('active'); // Remover de todos
          $(this).addClass('active'); // Agregar solo a este
          category_blog = category;
          current_page_blog = 1;
          current_keyword_blog = '';
          loadBlogMain(category, '', 1, false);
        }
      });

      // Búsqueda en tiempo real
      $('body').on('input keyup', '.search-blogs input[name="s"]', function(e) {
        const $input = $(this);
        const $button = $input.closest('.search-blogs').find('button[type="submit"]');
        const keyword = $input.val().trim();

        if (keyword.length >= 3) {
          $button.prop('disabled', false);
        } else {
          $button.prop('disabled', true);
        }

        // Si el campo queda vacío, mostrar todos los resultados
        if (keyword.length === 0) {
          current_page_blog = 1;
          current_keyword_blog = '';
          loadBlogMain(category_blog, '', 1, false);
        }
      });

      // Detectar cuando se hace clic en la X del input search
      $('body').on('search', '.search-blogs input[name="s"]', function(e) {
        const keyword = $(this).val().trim();
        
        if (keyword.length === 0) {
          current_page_blog = 1;
          current_keyword_blog = '';
          loadBlogMain(category_blog, '', 1, false);
        }
      });

      // Submit del formulario de búsqueda
      $('body').on('submit', '.search-blogs', function(e) {
        e.preventDefault();
        const keyword = $(this).find('input[name="s"]').val().trim();

        if (keyword.length >= 3) {
          current_page_blog = 1;
          current_keyword_blog = keyword;
          loadBlogMain(category_blog, keyword, 1, false);
        }
      });
    };

    // Function to update cart count
    function updateCartCount() {
      $.ajax({
        url: URL_AJAX,
        type: 'POST',
        data: {
          action: 'get_cart_count',
        },
        success: function (response) {
          if(response.success) {
            var countMobile = $('#cart-count-mobile');
            var counterGeneral = $('#shop-count-header');
            var counterProducts = $('#shop-mini-cart-count');
            
            var countToShow = response.data.count !== undefined ? response.data.count : 0;
            var countToProducts = response.data.products_count !== undefined ? response.data.products_count : 0;

            if(countMobile.length) {
              countMobile.text(countToShow);
            }

            if(counterGeneral.length) {
              counterGeneral.text(countToShow);
            }

            if(counterProducts.length) {
              counterProducts.text(countToProducts);
            }
          }
        },
        complete: function() {
          
        }
      });
    };

    // Manejar el clic en el botón para limpiar todos los filtros
    $('.clear-filters').on('click', function (e) {
      e.preventDefault();
      var orderby = $('.orderby').val();
      $('.category-link').removeClass('active');
      
      loadProducts(1, '', 0, 10000000, orderby);
    });

    // Cargar productos
    if(IS_SHOP) {
      // Cargar los productos inicialmente
      loadProducts(1, '', 0, 10000000, 'menu_order');


      // Manejar la paginación
      $(document).on('click', '.pagination a', function (e) {
        e.preventDefault();
        var href = $(this).attr('href');
        var page = 1;
        
        // Extraer el número de página de la URL
        if (href) {
          var match = href.match(/paged[=:](\d+)/);
          if (match && match[1]) {
            page = parseInt(match[1], 10);
          }
        }
        
        // Si no se encontró en el href, intentar obtenerlo del texto del enlace
        if (!page || isNaN(page) || page < 1) {
          var linkText = $(this).text().trim();
          var textPage = parseInt(linkText, 10);
          if (!isNaN(textPage) && textPage > 0) {
            page = textPage;
          } else {
            page = 1; // Valor por defecto si no se puede determinar
          }
        }
        
        var category = $('.category-link.active').data('category') || '';
        var orderby = $('.orderby').val() || 'menu_order';
        var minPrice = $('#min-price').length ? ($('#min-price').val() || 50) : 50;
        var maxPrice = $('#max-price').length ? ($('#max-price').val() || 10000000) : 10000000;

        loadProducts(page, category, minPrice, maxPrice, orderby);

        scrollToDiv('top-products');
      });

      // Manejar los clics en las categorías
      $(document).on('click', '.category-link', function (e) {
        e.preventDefault();
        $('.category-link').removeClass('active');
        $(this).addClass('active');
        var category = $(this).data('category');
        var orderby = $('.orderby').val();

        loadProducts(1, category, 0, 10000000, orderby);
      });

      // Manejar el cambio en el select de orden
      $(document).on('change', '.orderby', function (e) {
        e.preventDefault();
        var category = $('.category-link.active').data('category') || '';
        var orderby = $(this).val();

        loadProducts(1, category, 0, 10000000, orderby);
      });

      // Función para habilitar/deshabilitar el botón de búsqueda
      function toggleSearchButton() {
        var $input = $('.search-products input[name="s"]');
        var $submitButton = $('.search-products button[type="submit"]');
        var value = $input.val() || '';
        var hasMinLength = value.length >= 3;
        
        // Habilitar/deshabilitar botón de búsqueda
        $submitButton.prop('disabled', !hasMinLength);
      };

      // Función para mostrar/ocultar el botón de limpiar búsqueda
      function toggleClearButton(show) {
        var $clearButton = $('.clear-search');
        if (show) {
          $clearButton.removeClass('hidden');
        } else {
          $clearButton.addClass('hidden');
        }
      };

      // Inicializar el estado del botón al cargar
      toggleSearchButton();
      toggleClearButton(false);

      $(document).on('submit', '.search-products', function (e) {
        e.preventDefault();
        var keyword = $(this).find('input[name="s"]').val();
        var orderby = $('.orderby').val();
        loadProducts(1, '', 0, 10000000, orderby, keyword);
        // Mostrar el botón de limpiar después de hacer búsqueda
        toggleClearButton(true);
        // Marcar que hay una búsqueda activa
        $(this).data('search-active', true);
      });

      // Detectar cuando se limpia el input de búsqueda (clic en la X)
      $(document).on('search', '.search-products input[name="s"]', function (e) {
        // El evento 'search' se dispara cuando se hace clic en la X del input type="search"
        if ($(this).val() === '') {
          clearSearch();
        }
      });

      // También detectar cuando el input se vacía manualmente (backspace, delete, etc.)
      $(document).on('input', '.search-products input[name="s"]', function (e) {
        var $input = $(this);
        var $form = $input.closest('.search-products');
        var currentValue = $input.val() || '';
        var previousValue = $input.data('previous-search-value') || '';
        
        // Actualizar estado del botón de búsqueda
        toggleSearchButton();
        
        // Si tenía valor y ahora está vacío, y había una búsqueda activa, recargar productos
        if (previousValue !== '' && currentValue === '' && $form.data('search-active')) {
          clearSearch();
        }
        
        // Guardar el valor actual para la próxima vez
        $input.data('previous-search-value', currentValue);
      });

      // Función para limpiar la búsqueda
      function clearSearch() {
        var $input = $('.search-products input[name="s"]');
        var $form = $input.closest('.search-products');
        $input.val('');
        var category = $('.category-link.active').data('category') || '';
        var orderby = $('.orderby').val() || 'menu_order';
        var minPrice = $('#min-price').length ? ($('#min-price').val() || 50) : 50;
        var maxPrice = $('#max-price').length ? ($('#max-price').val() || 10000000) : 10000000;
        loadProducts(1, category, minPrice, maxPrice, orderby, '');
        toggleSearchButton();
        toggleClearButton(false);
        $form.data('search-active', false);
        $input.data('previous-search-value', '');
      };

      // Manejar clic en el botón de limpiar búsqueda
      $(document).on('click', '.clear-search', function (e) {
        e.preventDefault();
        clearSearch();
      });
    } else if (IS_PRODUCT_CATEGORY && TERM_ID_PROD) {
      
    };

    // Listado unificado del carrito (sin acordeón): los fragments de Woo
    // (clinova-mini-cart-wrapper, total-payment, empty-mini-cart) los aplica
    // wc-cart-fragments por su key; aquí solo se refrescan contadores.
    $(document.body).on('wc_fragments_refreshed wc_fragments_loaded', function(e, fragments) {
      updateCartCount();
    });

    // Al añadir producto: abrir SIEMPRE el sidebar y mostrar el listado actualizado
    $(document.body).on('added_to_cart', function(e, fragments, cart_hash, $button) {
      // Mostrar estado "Actualizando" en el total
      showTotalUpdating();

      openSidebarCart();
      $(document.body).trigger('wc_fragment_refresh');
      updateCartCount();

      if(IS_SHOP) {
        show_loader = false;
        loadProducts();
      }

      if(IS_PRODUCT) {
        show_loader = false;
        loadRelatedProducts(ID_PAGE);
      }
    });

    // Al quitar producto
    $(document.body).on('removed_from_cart', function(e, fragments, cart_hash) {
      // Mostrar estado "Actualizando" en el total
      showTotalUpdating();

      openSidebarCart();
      $(document.body).trigger('wc_fragment_refresh');
      updateCartCount();

      if(IS_SHOP) {
        show_loader = false;
        loadProducts();
      }

      if(IS_PRODUCT) {
        show_loader = false;
        loadRelatedProducts(ID_PAGE);
      }
    });

    // Forzar refresh al cargar la página
    $(document).ready(function() {
      updateCartCount();
    });

    // Cambio de país y guarda por AJAX.
    if(IS_CART) {
      $(document).on('submit', '.woocommerce-shipping-calculator', function (e) {
        e.preventDefault();
    
        var $sel = $('.country_to_state');
        var code = String($sel.val() || '').toUpperCase();
        if(!code) return;
    
        var prevCountry = (getCookie('wcpbc_country') || getCookie('wcpbc_client_country') || '').toUpperCase();
        var nonce = $('input[name="custom_nonce"]').val();

        showLoaderIfNeeded();
    
        $.ajax({
          url: window.URL_AJAX || '/wp-admin/admin-ajax.php',
          type: 'POST',
          dataType: 'json',
          data: { 
            action: 'check_cart_availability_by_country',
            country: code
          }
        })
        .done(function(res) {
          if(!res || !res.success) {
            setSelectCountryUI($sel, prevCountry);
            return;
          }
    
          var unavailable = res.data && res.data.unavailable_items ? res.data.unavailable_items : [];
    
          if(unavailable.length === 0) {
            showLoaderIfNeeded();
            commitCountryAndRunFlows(code, nonce);
            return;
          };
    
          hideLoaderIfNeeded();

          showCartCountryModal({
            country: code,
            prev: prevCountry,
            items: unavailable,
            onBack: function(){
              setSelectCountryUI($sel, prevCountry);
            },
            onContinue: function () {
              showLoaderMiniCartIfNeeded();
            
              commitCountryAndRunFlows(code, nonce).done(function () {
                var ajaxBase  = (window.wc_add_to_cart_params && window.wc_add_to_cart_params.wc_ajax_url) || '';
                var removeUrl = ajaxBase ? ajaxBase.replace('%%endpoint%%', 'remove_from_cart')       : '/?wc-ajax=remove_from_cart';
                var refreshUrl= ajaxBase ? ajaxBase.replace('%%endpoint%%', 'get_refreshed_fragments') : '/?wc-ajax=get_refreshed_fragments';
                var checkUrl  = (window.URL_AJAX || '/wp-admin/admin-ajax.php') + '?action=check_cart_availability_by_country';
            
                var security  = (window.wc_cart_params && window.wc_cart_params.remove_item_nonce) || (window.wc_add_to_cart_params && window.wc_add_to_cart_params.remove_item_nonce) || '';
            
                function removeOne(key) {
                  var data = { cart_item_key: key };
                  if (security) data.security = security;
            
                  return $.post(removeUrl, data).always(function (res) {
                    try {
                      if (res && res.fragments) {
                        var n = extractRemoveNonce(res.fragments);
                        if (n) security = n;
                      }
                    } catch (e) {}
                  });
                };
            
                function fetchUnavailable() {
                  return $.ajax({
                    url: checkUrl,
                    type: 'POST',
                    dataType: 'json',
                    data: { country: code }
                  }).then(function (r) {
                    var keys = (r && r.success && r.data && r.data.unavailable_items ? r.data.unavailable_items : [])
                      .map(function (it) { return it.item_key || it.cart_item_key || it.key || it.hash; })
                      .filter(Boolean);
                    return keys;
                  });
                };
            
                function refreshFragments() {
                  return $.post(refreshUrl).then(function (fr) {
                    if (fr && fr.fragments) {
                      var n = extractRemoveNonce(fr.fragments);
                      if (n) security = n;
                    }
                  });
                };
            
                function purgeUntilClean() {
                  return fetchUnavailable().then(function (keys) {
                    if(!keys.length) return;
            
                    var chain = $.Deferred().resolve();
                    keys.forEach(function (k) {
                      chain = chain.then(function(){ return removeOne(k); })
                      .then(refreshFragments);
                    });
                    return chain.then(purgeUntilClean);
                  });
                };
            
                purgeUntilClean()
                .always(function () {
                  if ((typeof IS_CART !== 'undefined' && IS_CART) || (typeof IS_CHECKOUT !== 'undefined' && IS_CHECKOUT)) {
                    window.location.reload();
                  } else {
                    showLoaderMiniCartIfNeeded();
                    updateCartTable();
                  }
                });
            
                function extractRemoveNonce(fragments) {
                  var html = fragments && (fragments["div.widget_shopping_cart_content"] || fragments[".widget_shopping_cart_content"]);
                  if (!html) return null;
                  var tmp = document.createElement('div');
                  tmp.innerHTML = html;
                  var input = tmp.querySelector('input[name="remove_item_nonce"]');
                  return input ? input.value : null;
                };
              }).fail(function () {
                updateCartTable();
              });
            }
          });
        })
        .fail(function() {
          setSelectCountryUI($sel, prevCountry);
        });
      });
    } else if(IS_CHECKOUT) {
      $(document).on('change', '.country_to_state', function (e) {
        if(window.__skipCheckoutCountryHandler) {
          window.__skipCheckoutCountryHandler = false;
          return;
        }

        e.preventDefault();
        e.stopImmediatePropagation();
    
        var $sel = $(this);
        var code = String($sel.val() || '').toUpperCase();
        if(!code) return;
    
        var prevCountry = (getCookie('wcpbc_country') || getCookie('wcpbc_client_country') || '').toUpperCase();
        var nonce = $('input[name="custom_nonce"]').val() || (typeof window.SAVE_LOCATION_NONCE !== 'undefined' ? window.SAVE_LOCATION_NONCE : '');

        showLoaderIfNeeded();
    
        $.ajax({
          url: window.URL_AJAX || '/wp-admin/admin-ajax.php',
          type: 'POST',
          dataType: 'json',
          data: { 
            action: 'check_cart_availability_by_country',
            country: code
          }
        })
        .done(function(res) {
          if(!res || !res.success) {
            setSelectCountryUI($sel, prevCountry);
            hideLoaderIfNeeded();
            return;
          }
    
          var unavailable = res.data && res.data.unavailable_items ? res.data.unavailable_items : [];
    
          if(unavailable.length === 0) {
            showLoaderIfNeeded();
            commitCountryAndRunFlows(code, nonce);
            hideLoaderIfNeeded();
            return;
          };
    
          hideLoaderIfNeeded();

          showCartCountryModal({
            country: code,
            prev: prevCountry,
            items: unavailable,
            onBack: function() {
              window.__skipCheckoutCountryHandler = true;
              setSelectCountryUI($sel, prevCountry);

              showLoaderMiniCartIfNeeded();

              $.post(window.URL_AJAX || '/wp-admin/admin-ajax.php', {
                action: 'guardar_direccion_modal',
                billing_country: prevCountry,
                billing_state: '',
                billing_city: '',
                nonce: nonce
              })
              .always(function() {
                $sel.trigger('change');
                $(document.body).trigger('update_checkout');
                
              });
            },
            onContinue: function () {
              showLoaderMiniCartIfNeeded();

              commitCountryAndRunFlows(code, nonce).done(function () {
                var ajaxBase  = (window.wc_add_to_cart_params && window.wc_add_to_cart_params.wc_ajax_url) || '';
                var removeUrl = ajaxBase ? ajaxBase.replace('%%endpoint%%', 'remove_from_cart')       : '/?wc-ajax=remove_from_cart';
                var refreshUrl= ajaxBase ? ajaxBase.replace('%%endpoint%%', 'get_refreshed_fragments') : '/?wc-ajax=get_refreshed_fragments';
                var checkUrl  = (window.URL_AJAX || '/wp-admin/admin-ajax.php') + '?action=check_cart_availability_by_country';
            
                var security  = (window.wc_cart_params && window.wc_cart_params.remove_item_nonce) || (window.wc_add_to_cart_params && window.wc_add_to_cart_params.remove_item_nonce) || '';
            
                function removeOne(key) {
                  var data = { cart_item_key: key };
                  if (security) data.security = security;
            
                  return $.post(removeUrl, data).always(function (res) {
                    try {
                      if (res && res.fragments) {
                        var n = extractRemoveNonce(res.fragments);
                        if (n) security = n;
                      }
                    } catch (e) {}
                  });
                };
            
                function fetchUnavailable() {
                  return $.ajax({
                    url: checkUrl,
                    type: 'POST',
                    dataType: 'json',
                    data: { country: code }
                  }).then(function (r) {
                    var keys = (r && r.success && r.data && r.data.unavailable_items ? r.data.unavailable_items : [])
                      .map(function (it) { return it.item_key || it.cart_item_key || it.key || it.hash; })
                      .filter(Boolean);
                    return keys;
                  });
                };
            
                function refreshFragments() {
                  return $.post(refreshUrl).then(function (fr) {
                    if (fr && fr.fragments) {
                      var n = extractRemoveNonce(fr.fragments);
                      if (n) security = n;
                    }
                  });
                };
            
                function purgeUntilClean() {
                  return fetchUnavailable().then(function (keys) {
                    if(!keys.length) return;
            
                    var chain = $.Deferred().resolve();
                    keys.forEach(function (k) {
                      chain = chain.then(function(){ return removeOne(k); })
                      .then(refreshFragments);
                    });
                    return chain.then(purgeUntilClean);
                  });
                };
            
                purgeUntilClean()
                .always(function () {
                  if (typeof updateMiniCart === 'function') updateMiniCart();
          
                  if ((typeof IS_CART !== 'undefined' && IS_CART) || (typeof IS_CHECKOUT !== 'undefined' && IS_CHECKOUT)) {
                    window.location.reload();
                  } else {
                    showLoaderMiniCartIfNeeded();
                  }
                });
            
                function extractRemoveNonce(fragments) {
                  var html = fragments && (fragments["div.widget_shopping_cart_content"] || fragments[".widget_shopping_cart_content"]);
                  if (!html) return null;
                  var tmp = document.createElement('div');
                  tmp.innerHTML = html;
                  var input = tmp.querySelector('input[name="remove_item_nonce"]');
                  return input ? input.value : null;
                };
              }).fail(function () {
                
              });
            }
          });
        })
        .fail(function() {
          setSelectCountryUI($sel, prevCountry);
          hideLoaderIfNeeded();
        });
      });

      // Envolver order_review_heading y order_review en un div
      function wrapOrderReview() {
        var $orderReviewHeading = $('#order_review_heading');
        var $orderReview = $('#order_review');
        
        if ($orderReviewHeading.length && $orderReview.length) {
          // Verificar si ya están envueltos
          if (!$orderReviewHeading.parent().hasClass('order-review-wrapper')) {
            // Crear el div wrapper
            var $wrapper = $('<div class="order-review-wrapper"></div>');
            
            // Insertar el wrapper antes del order_review_heading
            $orderReviewHeading.before($wrapper);
            
            // Mover order_review_heading y order_review dentro del wrapper
            $wrapper.append($orderReviewHeading);
            $wrapper.append($orderReview);
          }
        }
      };
      
      // Ejecutar al cargar y cuando se actualice el checkout
      $(document).ready(function() {
        wrapOrderReview();
      });
      
      $(document.body).on('updated_checkout', function() {
        wrapOrderReview();
      });
      
    } else {
      $(document).on('change', '.custom-change-country, .country_to_state', function (e) {
        e.preventDefault();
        if(IS_CART) return;
    
        var $sel = $(this);
        var code = String($sel.val() || '').toUpperCase();
        if(!code) return;
    
        var prevCountry = (getCookie('wcpbc_country') || getCookie('wcpbc_client_country') || '').toUpperCase();
        var nonce = $('input[name="custom_nonce"]').val() || (typeof window.SAVE_LOCATION_NONCE !== 'undefined' ? window.SAVE_LOCATION_NONCE : '');

        showLoaderIfNeeded();
    
        $.ajax({
          url: window.URL_AJAX || '/wp-admin/admin-ajax.php',
          type: 'POST',
          dataType: 'json',
          data: { 
            action: 'check_cart_availability_by_country',
            country: code
          }
        })
        .done(function(res) {
          if(!res || !res.success) {
            setSelectCountryUI($sel, prevCountry);
            return;
          }
    
          var unavailable = res.data && res.data.unavailable_items ? res.data.unavailable_items : [];
    
          if(unavailable.length === 0) {
            showLoaderIfNeeded();
            commitCountryAndRunFlows(code, nonce);
            return;
          };
    
          hideLoaderIfNeeded();

          showCartCountryModal({
            country: code,
            prev: prevCountry,
            items: unavailable,
            onBack: function() {
              setSelectCountryUI($sel, prevCountry);
            },
            onContinue: function () {
              showLoaderMiniCartIfNeeded();
            
              commitCountryAndRunFlows(code, nonce).done(function () {
                var ajaxBase  = (window.wc_add_to_cart_params && window.wc_add_to_cart_params.wc_ajax_url) || '';
                var removeUrl = ajaxBase ? ajaxBase.replace('%%endpoint%%', 'remove_from_cart')       : '/?wc-ajax=remove_from_cart';
                var refreshUrl= ajaxBase ? ajaxBase.replace('%%endpoint%%', 'get_refreshed_fragments') : '/?wc-ajax=get_refreshed_fragments';
                var checkUrl  = (window.URL_AJAX || '/wp-admin/admin-ajax.php') + '?action=check_cart_availability_by_country';
            
                var security  = (window.wc_cart_params && window.wc_cart_params.remove_item_nonce) || (window.wc_add_to_cart_params && window.wc_add_to_cart_params.remove_item_nonce) || '';
            
                function removeOne(key) {
                  var data = { cart_item_key: key };
                  if (security) data.security = security;
            
                  return $.post(removeUrl, data).always(function (res) {
                    try {
                      if (res && res.fragments) {
                        var n = extractRemoveNonce(res.fragments);
                        if (n) security = n;
                      }
                    } catch (e) {}
                  });
                };
            
                function fetchUnavailable() {
                  return $.ajax({
                    url: checkUrl,
                    type: 'POST',
                    dataType: 'json',
                    data: { country: code }
                  }).then(function (r) {
                    var keys = (r && r.success && r.data && r.data.unavailable_items ? r.data.unavailable_items : [])
                      .map(function (it) { return it.item_key || it.cart_item_key || it.key || it.hash; })
                      .filter(Boolean);
                    return keys;
                  });
                };
            
                function refreshFragments() {
                  return $.post(refreshUrl).then(function (fr) {
                    if (fr && fr.fragments) {
                      var n = extractRemoveNonce(fr.fragments);
                      if (n) security = n;
                    }
                  });
                };
            
                function purgeUntilClean() {
                  return fetchUnavailable().then(function (keys) {
                    if(!keys.length) return;
            
                    var chain = $.Deferred().resolve();
                    keys.forEach(function (k) {
                      chain = chain.then(function(){ return removeOne(k); })
                      .then(refreshFragments);
                    });
                    return chain.then(purgeUntilClean);
                  });
                };
            
                purgeUntilClean()
                .always(function () {
                  if (typeof updateMiniCart === 'function') updateMiniCart();
          
                  if ((typeof IS_CART !== 'undefined' && IS_CART) || (typeof IS_CHECKOUT !== 'undefined' && IS_CHECKOUT)) {
                    window.location.reload();
                  } else {
                    showLoaderMiniCartIfNeeded();
                  }
                });
            
                function extractRemoveNonce(fragments) {
                  var html = fragments && (fragments["div.widget_shopping_cart_content"] || fragments[".widget_shopping_cart_content"]);
                  if (!html) return null;
                  var tmp = document.createElement('div');
                  tmp.innerHTML = html;
                  var input = tmp.querySelector('input[name="remove_item_nonce"]');
                  return input ? input.value : null;
                };
              }).fail(function () {
                
              });
            }
          });
        })
        .fail(function() {
          setSelectCountryUI($sel, prevCountry);
        });
      });
    }
    
    // Función para cargar productos relacionados
    function loadRelatedProducts(productId, perPage = 4) {
      if(!productId) {
        return;
      }

      $.ajax({
        url: URL_AJAX,
        type: 'POST',
        data: {
          action: 'load_related_products',
          product_id: productId,
          per_page: perPage
        },
        success: function(response) {
          if(response.success) {
            $('.single-product .product .related').html(`
              <h2>Otros usuarios también vieron</h2>
              <ul class="products">${response.data.products}</ul>
            `);
          } else {
          }
        },
        error: function(response) {
        },
      });
    };
    
    // Single Product
    if(typeof IS_PRODUCT !== 'undefined' && IS_PRODUCT === true) {

      loadRelatedProducts(ID_PAGE);
      
      // Cargar productos relacionados
      var currentProductId = $('form.cart').data('product_id') || $('input[name="product_id"]').val() || $('input[name="add-to-cart"]').val();
      if(currentProductId) {
        loadRelatedProducts(currentProductId, 4);
      }

      /**
       * Con el producto ya en el carrito se dejan los DOS botones: "Añadir al carrito" (que al
       * reenviar el formulario suma otra unidad, porque WooCommerce acumula la cantidad) y
       * "Pagar ahora". El formulario se mantiene visible para poder elegir variante y cantidad.
       * Devuelve el boton de "Pagar ahora".
       */
      function mostrarBotonesEnCarrito($form) {
        if(!$form || !$form.length) return null;

        $form.find('.single_add_to_cart_button')
          .prop('disabled', false).removeClass('loading').show();
        $form.find('.quantity, .variations, .woocommerce-variation').show();
        $form.find('.woocommerce-variation-description, .woocommerce-variation-availability').show();

        var $contenedor = $form.hasClass('variations_form') ? $form.find('.variations_button') : $form;
        var $viewCartBtn = $contenedor.find('a.view-cart-btn');

        if(!$viewCartBtn.length) {
          $viewCartBtn = $('<a>', {
            href: URL_CHECKOUT, // (typeof CustomCartVars !== 'undefined' ? CustomCartVars.cart_url : wc_add_to_cart_params.cart_url);
            class: 'button added_to_cart wc-forward view-cart-btn',
            text: 'Pagar ahora'
          });

          $contenedor.append($viewCartBtn);
        }

        return $viewCartBtn;
      };

      function handleIsInCart() {
        var $form = $('form.cart');

        if($form.find('.single_add_to_cart_button').length) {
          mostrarBotonesEnCarrito($form);
        }
      };

      if(IS_IN_CART) {
        handleIsInCart();
      }

      // Cuando carga la página
      $(window).on('load', function () {
        //setTimeout(function () {
          applyNiceSelect();
        //}, 1000);
      });

      // Cuando se inicializa el form de variaciones
      $(document).on('woocommerce_variation_form', function () {
        applyNiceSelect();
      });

      // Cuando cambian valores dinámicamente
      $(document).on('woocommerce_variation_has_changed woocommerce_update_variation_values', function () {
        applyNiceSelect();
      });

      // Cuando se envía el formulario de agregar al carrito / Producto simple
      $(document).on('submit', 'form.cart:not(.variations_form)', function(e) {
        e.preventDefault();
  
        var $form = $(this);
        var $btn  = $form.find('.single_add_to_cart_button');
  
        if (!$btn.length) return;
        
        $btn.prop('disabled', true).addClass('loading');
        
        var formData = new FormData($form[0]);
        
        formData.append('add-to-cart', $btn.val() || $btn.data('product_id'));
  
        $.ajax({
          url: wc_add_to_cart_params.wc_ajax_url.toString().replace('%%endpoint%%','add_to_cart'),
          type: 'POST',
          data: formData,
          processData: false,
          contentType: false,
          success: function(res) {
            if(res && res.fragments) {
              $.each(res.fragments, function(selector, html) {
                $(selector).replaceWith(html);
              });
            }
            
            var $viewCartBtn = mostrarBotonesEnCarrito($form);

            $(document.body).trigger('added_to_cart', [res.fragments, res.cart_hash, $viewCartBtn]);
            
            if(typeof openSidebarCart === 'function') {
              openSidebarCart();
            }
          },
          error: function() {
            console.error('Error AJAX add_to_cart');
            $btn.prop('disabled', false).removeClass('loading');
          }
        });
      });

      // Cuando se envía el formulario de agregar al carrito / Producto variable
      $(document).on('submit', 'form.cart.variations_form', function(e) {
        e.preventDefault();
  
        var $form = $(this);
        var $btn  = $form.find('.single_add_to_cart_button');
  
        if(!$btn.length) return;
        
        $btn.prop('disabled', true).addClass('loading');
        
        var formData = new FormData($form[0]);
  
        $.ajax({
          url: wc_add_to_cart_params.wc_ajax_url.toString().replace('%%endpoint%%','add_to_cart'),
          type: 'POST',
          data: formData,
          processData: false,
          contentType: false,
          success: function(res) {
            if(res && res.fragments) {
              $.each(res.fragments, function(selector, html) {
                $(selector).replaceWith(html);
              });
            }
            
            var $viewCartBtn = mostrarBotonesEnCarrito($form);

            $(document.body).trigger('added_to_cart', [res.fragments, res.cart_hash, $viewCartBtn]);
            
            if(typeof openSidebarCart === 'function') {
              openSidebarCart();
            }
          },
          error: function() {
            console.error('Error AJAX add_to_cart');
            $btn.prop('disabled', false).removeClass('loading');
          }
        });
      });

      // Cuando se quita al carrito
      $(document.body).on('removed_from_cart', function(e, fragments, cart_hash) {
        var $form = $('form.cart');
        if (!$form.length) return;

        $form.find('a.added_to_cart, a.view-cart-btn').remove();
        
        $form.find('.quantity').show();

        var productId = $form.find('.product-id-fixed').val();
        var isVariable = $form.hasClass('variations_form');

        if(isVariable) {
          $form.find('.woocommerce-variation').show();
          $form.find('.woocommerce-variation-description, .woocommerce-variation-availability').show();
          $form.find('.variations').show();

          if(!$form.find('.single_add_to_cart_button').length) {
            var $btn = $('<button>', {
              type: 'submit',
              name: 'add-to-cart',
              class: 'single_add_to_cart_button button alt ajax_add_to_cart add_to_cart_button',
              text: 'Añadir al carrito'
            });

            $form.find('.variations_button').append($btn);
          }
        } else if(productId) {
          var $btn = $('<button>', {
            type: 'submit',
            name: 'add-to-cart',
            value: productId,
            class: 'single_add_to_cart_button button alt ajax_add_to_cart add_to_cart_button',
            text: 'Añadir al carrito'
          });

          $form.append($btn);
        }

        $form.find('.go-to-cart').remove();

        if (typeof applyNiceSelect === 'function') applyNiceSelect();
      
        $(document.body).trigger('wc_fragment_refresh');
      });

      (function($) {
        var productId = $('form.cart .product-id-fixed').val() || $('form.cart input[name="add-to-cart"]').val();
        var ajaxUrl   = wc_add_to_cart_params.ajax_url;
        var cartUrl   = URL_CHECKOUT; //(typeof CustomCartVars !== 'undefined' ? CustomCartVars.cart_url : wc_add_to_cart_params.cart_url);
      
        function showAddToCart() {
          var $form = $('form.cart');
          if (!$form.length) return;
      
          $form.find('a.view-cart-btn, a.added_to_cart').remove();
          $form.find('.quantity, .variations, .woocommerce-variation').show();
          $form.find('.woocommerce-variation-description, .woocommerce-variation-availability').show();
      
          if ($form.find('.single_add_to_cart_button').length === 0) {
            var $btn = $('<button>', {
              type: 'submit',
              name: 'add-to-cart',
              value: productId,
              class: 'single_add_to_cart_button button alt ajax_add_to_cart add_to_cart_button',
              text: 'Añadir al carrito'
            });
            if ($form.hasClass('variations_form')) {
              $form.find('.variations_button').append($btn);
            } else {
              $form.append($btn);
            }
          } else {
            $form.find('.single_add_to_cart_button').show().prop('disabled', false).removeClass('loading');
          }
        };
      
        function showViewCart() {
          var $form = $('form.cart');
          if (!$form.length) return;
      
          // showAddToCart garantiza que el boton de añadir exista y este activo (para sumar
          // otra unidad); encima se agrega "Pagar ahora", de modo que queden los dos.
          showAddToCart();
          mostrarBotonesEnCarrito($form);
        };
      
        function updateSingleState() {
          var $form = $('form.cart');
          if($form.length) {
            $form.addClass('!hidden');
          }

          if (!productId) return;
          $.post(ajaxUrl, { action: 'is_product_in_cart', product_id: productId }, function(resp) {
            if(resp && resp.success) {
              if(resp.data.in_cart) {
                showViewCart();
              } else {
                showAddToCart();
              }

              if($form.length) {
                $form.removeClass('!hidden');
              }
            } else {
              if($form.length) {
                $form.removeClass('!hidden');
              }
            }
          }, 'json');
        };
      
        // Ejecutar en load
        $(document).ready(updateSingleState);
      
        // Reaccionar a eventos WooCommerce
        $(document.body).on('wc_fragments_refreshed removed_from_cart added_to_cart', function() {
          setTimeout(updateSingleState, 100);
        });
      
        // Al volver con back/forward cache
        window.addEventListener('pageshow', function(ev) {
          if (ev.persisted) {
            setTimeout(updateSingleState, 50);
          }
        });
      })(jQuery);

      // Sticky gallery en desktop (992px+)
      (function($) {
        var galleryInitialTop = null;
        var stopPoint = null;
        var isInitialized = false;

        function initStickyGallery() {
          // Solo ejecutar en desktop (992px en adelante)
          if ($(window).width() < 992) {
            $('.woocommerce-product-gallery').removeClass('sticky-gallery-active');
            return;
          }

          var $gallery = $('.woocommerce-product-gallery');
          var $contentWrapper = $('.product-content-wrapper');
          var $related = $('.related');

          if (!$gallery.length) {
            return;
          }

          // Guardar posición inicial de la galería (posición absoluta desde el top del documento)
          galleryInitialTop = $gallery.offset().top;

          // Calcular el punto de parada (el primero que encuentre entre content-wrapper o related)
          stopPoint = null;
          
          if ($contentWrapper.length) {
            stopPoint = $contentWrapper.offset().top;
          }
          
          if ($related.length) {
            var relatedTop = $related.offset().top;
            if (!stopPoint || relatedTop < stopPoint) {
              stopPoint = relatedTop;
            }
          }

          // Si no hay punto de parada, usar el final del contenedor padre
          if (!stopPoint) {
            var $parent = $gallery.closest('.product, .single-product, .container');
            if ($parent.length) {
              stopPoint = $parent.offset().top + $parent.outerHeight();
            } else {
              stopPoint = $(document).height();
            }
          }

          isInitialized = true;
        };

        function handleStickyGallery() {
          // Solo ejecutar en desktop (992px en adelante)
          if ($(window).width() < 992) {
            $('.woocommerce-product-gallery').css({
              'position': '',
              'top': '',
              'z-index': ''
            });
            return;
          }

          if (!isInitialized) {
            initStickyGallery();
          }

          var $gallery = $('.woocommerce-product-gallery');
          
          if (!$gallery.length || galleryInitialTop === null || stopPoint === null) {
            return;
          }

          var windowTop = $(window).scrollTop() + 60;
          var galleryHeight = $gallery.outerHeight();
          
          // Recalcular el stopPoint en cada scroll para mayor precisión
          var $contentWrapper = $('.product-content-wrapper');
          var $related = $('.related');
          var currentStopPoint = stopPoint;
          
          if ($contentWrapper.length) {
            currentStopPoint = $contentWrapper.offset().top;
          }
          if ($related.length) {
            var relatedTop = $related.offset().top;
            if (!currentStopPoint || relatedTop < currentStopPoint) {
              currentStopPoint = relatedTop;
            }
          }
          
          // Calcular el punto máximo de scroll donde puede estar sticky
          // Cuando la galería es sticky con top: 60px, su parte inferior está en: windowTop + 60 + galleryHeight
          // Queremos que cuando esa parte inferior llegue a currentStopPoint - 48, deje de ser sticky
          // Entonces: windowTop + 60 + galleryHeight = currentStopPoint - 48
          // windowTop = currentStopPoint - 48 - 60 - galleryHeight
          var maxStickyScroll = currentStopPoint - galleryHeight - 60 - 48;

          // Si el scroll está por debajo de la posición inicial, no hacer nada (posición normal)
          if (windowTop < galleryInitialTop) {
            $gallery.css({
              'position': '',
              'top': '',
              'z-index': ''
            });
            return;
          }

          // Si el scroll está por debajo de la posición inicial pero aún no ha llegado al stopPoint
          if (windowTop >= galleryInitialTop && windowTop <= maxStickyScroll) {
            // Aplicar sticky normalmente
            $gallery.css({
              'position': 'sticky',
              'top': '60px',
              'z-index': '10',
              'transform': '',
              'margin-top': ''
            });
          } 
          // Si el scroll ha pasado el punto máximo, mantener la galería en posición absoluta
          // en el stopPoint para que se quede ahí con 48px de margen
          else if (windowTop > maxStickyScroll) {
            // Obtener el contenedor padre
            var $parent = $gallery.closest('.product, .single-product, .woocommerce');
            if (!$parent.length) {
              $parent = $gallery.parent();
            }
            
            // Asegurar que el contenedor padre tenga position: relative
            if ($parent.css('position') === 'static' || !$parent.css('position')) {
              $parent.css('position', 'relative');
            }
            
            // Usar el currentStopPoint que ya se calculó arriba
            // Calcular la posición absoluta relativa al contenedor padre
            // La parte inferior de la galería debe estar en: currentStopPoint - 48
            // Entonces el top de la galería debe estar en: currentStopPoint - 48 - galleryHeight
            // Relativo al parent: (currentStopPoint - 48 - galleryHeight) - parentTop
            var parentTop = $parent.offset().top;
            var absoluteTop = currentStopPoint - parentTop - galleryHeight - 48;
            
            // Asegurar que no sea negativo
            if (absoluteTop < 0) {
              absoluteTop = 0;
            }
            
            $gallery.css({
              'position': 'relative',
              'top': absoluteTop + 'px',
              'z-index': '10',
              'transform': '',
              'margin-top': ''
            });
          }
        };

        // Ejecutar al cargar y al hacer scroll
        if ($('.woocommerce-product-gallery').length) {
          // Esperar a que el DOM esté completamente cargado
          $(document).ready(function() {
            setTimeout(function() {
              initStickyGallery();
              handleStickyGallery();
            }, 100);
          });
          
          $(window).on('scroll', function() {
            handleStickyGallery();
          });

          // Recalcular al redimensionar la ventana
          $(window).on('resize', function() {
            isInitialized = false;
            initStickyGallery();
            handleStickyGallery();
          });
        };
      })(jQuery);

      // Sticky form.cart cuando se hace scroll desde methods-delivery (desktop 992px+)
      (function($) {
        function handleStickyCartForm() {
          // Solo ejecutar en desktop (992px en adelante)
          if ($(window).width() < 992) {
            $('form.cart').removeClass('active-sticky');
            $('.methods-payment-bold').css('padding-top', '');
            return;
          }

          var $methodsDelivery = $('.methods-delivery');
          var $cartForm = $('form.cart');
          var $methodsPayment = $('.methods-payment-bold');

          if (!$methodsDelivery.length || !$cartForm.length) {
            return;
          }

          var windowTop = $(window).scrollTop();
          var methodsDeliveryTop = $methodsDelivery.offset().top;
          var methodsDeliveryHeight = $methodsDelivery.outerHeight();
          var triggerPoint = methodsDeliveryTop + methodsDeliveryHeight;

          // Si el scroll ha pasado el div.methods-delivery
          if (windowTop >= triggerPoint) {
            // Agregar clase active-sticky al form.cart
            if (!$cartForm.hasClass('active-sticky')) {
              $cartForm.addClass('active-sticky');
              
              // Calcular la altura del form.cart y aplicarla como padding-top al methods-payment-bold
              if ($methodsPayment.length) {
                var cartFormHeight = $cartForm.outerHeight();
                $methodsPayment.css('padding-top', cartFormHeight + 'px');
              }
            } else {
              // Si ya tiene la clase, recalcular el padding-top por si cambió la altura del form
              if ($methodsPayment.length) {
                var cartFormHeight = $cartForm.outerHeight();
                $methodsPayment.css('padding-top', cartFormHeight + 'px');
              }
            }
          } else {
            // Si el scroll vuelve a subir, quitar la clase
            if ($cartForm.hasClass('active-sticky')) {
              $cartForm.removeClass('active-sticky');
              
              // Quitar el padding-top del methods-payment-bold
              if ($methodsPayment.length) {
                $methodsPayment.css('padding-top', '');
              }
            }
          }
        };

        // Ejecutar al cargar y al hacer scroll
        if ($('.methods-delivery').length && $('form.cart').length) {
          handleStickyCartForm();
          
          $(window).on('scroll', function() {
            handleStickyCartForm();
          });

          // Recalcular al redimensionar la ventana
          $(window).on('resize', function() {
            handleStickyCartForm();
          });
        };
      })(jQuery);
    };

    if($('section iframe, main iframe').length) {
      $('section iframe, main iframe').each(function () {
        var $iframe = $(this);
        $iframe.wrap('<div class="iframe-wrapper"></div>');
      });
    };

    // Detectar cuando se agrega un examen (producto) al carrito desde clinova-for-woocommerce
    let isHandlingUpdate = false; // Flag para evitar múltiples llamadas simultáneas
    let lastCartState = {
      hasContent: false,
      count: 0,
      wrapperExists: false
    };
    
    // Función para verificar el estado del carrito
    function checkClinovaCartState() {
      const $wrapper = $('.clinova-mini-cart-wrapper');
      const $count = $('.clinova-mini-cart-count');
      const $minicart = $('.clinova-mini-cart');
      
      // Verificar si el wrapper tiene contenido (no está vacío)
      // Cuando está vacío: <div class="clinova-mini-cart-wrapper"></div>
      // Cuando tiene contenido: <div class="clinova-mini-cart-wrapper"><div class="clinova-mini-cart">...</div></div>
      let hasContent = false;
      if ($wrapper.length > 0) {
        const wrapperHtml = $wrapper.html().trim();
        // Si tiene contenido y contiene el minicart, entonces tiene items
        hasContent = wrapperHtml !== '' && $minicart.length > 0;
      }
      
      const currentState = {
        wrapperExists: $wrapper.length > 0,
        hasContent: hasContent,
        count: $count.length > 0 ? parseInt($count.text()) || 0 : 0
      };
      
      return currentState;
    };
    
    // Estrategia 1: MutationObserver para detectar cambios en el minicart de clinova
    function initClinovaCartObserver() {
      // Observar el body o un contenedor padre para detectar cuando se agrega el wrapper
      const $body = $('body');
      
      if ($body.length) {
        const observer = new MutationObserver(function(mutations) {
          if (isHandlingUpdate) return;
          
          let shouldCheck = false;
          
          // Verificar si hay cambios relevantes
          mutations.forEach(function(mutation) {
            // Si se agregaron nodos, verificar si es el minicart
            if (mutation.addedNodes.length > 0) {
              mutation.addedNodes.forEach(function(node) {
                if (node.nodeType === 1) { // Element node
                  const $node = $(node);
                  if ($node.is('.clinova-mini-cart-wrapper') || 
                      $node.find('.clinova-mini-cart-wrapper').length > 0 ||
                      $node.find('.clinova-mini-cart-count').length > 0) {
                    shouldCheck = true;
                  }
                }
              });
            }
            
            // Si se modificó el contenido del wrapper
            if (mutation.type === 'childList' && 
                $(mutation.target).is('.clinova-mini-cart-wrapper') ||
                $(mutation.target).closest('.clinova-mini-cart-wrapper').length > 0) {
              shouldCheck = true;
            }
          });
          
          if (shouldCheck) {
            setTimeout(function() {
              const currentState = checkClinovaCartState();
              
              // Detectar cuando se agrega el primer examen (wrapper pasa de vacío a tener contenido)
              if (!lastCartState.hasContent && currentState.hasContent) {
                lastCartState = currentState;
                handleClinovaCartUpdate();
                return;
              }
              
              // Detectar cuando aumenta el contador
              if (currentState.count > lastCartState.count) {
                lastCartState = currentState;
                handleClinovaCartUpdate();
                return;
              }
              
              // Actualizar estado
              if (currentState.count !== lastCartState.count || 
                  currentState.hasContent !== lastCartState.hasContent) {
                lastCartState = currentState;
              }
            }, 300);
          }
        });

        // Observar cambios en el body
        observer.observe(document.body, {
          childList: true,
          subtree: true,
          attributes: false
        });
        
      }
    };

    // Función para mostrar estado "Actualizando" en el total
    function showTotalUpdating() {
      var $totalPayment = $('.total-payment');
      if ($totalPayment.length && !$totalPayment.hasClass('hidden')) {
        // Guardar el contenido original si no está guardado
        if (!$totalPayment.data('original-content')) {
          $totalPayment.data('original-content', $totalPayment.html());
        }
        // Mostrar estado de actualizando
        $totalPayment.html('<div class="total-updating" style="padding: 1rem; text-align: center; color: #666;"><span>Actualizando...</span></div>');
      }
    };

    // Función para ocultar estado "Actualizando" en el total
    function hideTotalUpdating() {
      var $totalPayment = $('.total-payment');
      if ($totalPayment.length) {
        // El contenido se restaurará cuando se reemplace el fragmento
        // Esta función es principalmente para limpiar si es necesario
      }
    };

    /**
     * Aplica al bloque .total-payment el total que viene en la respuesta AJAX del plugin (exámenes/sueroterapias).
     * @param {Object} responseData - response.data del AJAX (debe tener .fragments['.clinova-mini-cart-wrapper'])
     */
    function applyClinovaTotalToPaymentFromResponse(responseData) {
      if (!responseData || !responseData.fragments) {
        console.warn('[Rogans] applyClinovaTotalToPaymentFromResponse: no hay responseData o fragments');
        return;
      }
      var keys = Object.keys(responseData.fragments || {});
      var fragment = responseData.fragments['.clinova-mini-cart-wrapper'];
      if (!fragment) {
        console.warn('[Rogans] No existe fragment .clinova-mini-cart-wrapper. Keys:', keys);
        return;
      }
      var $tmp = $('<div>').html(fragment);
      var $totalSpan = $tmp.find('.clinova-mini-cart-total span:last-child');
      var totalHtml = $totalSpan.length ? $totalSpan.html() : null;
      if (totalHtml) {
        var $target = $('.total-payment .mini-cart-total .mini-cart-value');
        if ($target.length) {
          $target.html(totalHtml);
        } else {
          console.warn('[Rogans] No se encontró .total-payment .mini-cart-total .mini-cart-value en el DOM');
        }
      }
    }

    /**
     * Copia el total del minicart de Clinova desde el DOM (por si ya se reemplazó el wrapper).
     */
    function syncTotalPaymentFromClinovaMinicart() {
      var $source = $('.clinova-mini-cart-wrapper .clinova-mini-cart-total span:last-child');
      var $target = $('.total-payment .mini-cart-total .mini-cart-value');
      if ($source.length && $target.length && $source.html()) {
        $target.html($source.html());
      }
    }

    /**
     * Muestra en consola TODOS los fees de domicilio (exámenes y sueroterapias) y la modalidad actual.
     */
    function logAllFeesAndModalidad() {
      var v = typeof CustomCartVars !== 'undefined' ? CustomCartVars : {};
      var feeExam = v.domicilio_fee_exam != null ? v.domicilio_fee_exam : null;
      var feeExamRaw = v.domicilio_fee_exam_raw != null ? v.domicilio_fee_exam_raw : '';
      var feeSuero = v.domicilio_fee_suero != null ? v.domicilio_fee_suero : null;
      var feeSueroRaw = v.domicilio_fee_suero_raw != null ? v.domicilio_fee_suero_raw : '';
      var isDomicilioExam = $('.clinova-mini-cart-wrapper input[name="clinova_modalidad_global"][value="domicilio"]').is(':checked');
      var isDomicilioSuero = $('.clinova-mini-cart-wrapper input[name="clinova_modalidad_global_suero"][value="domicilio"]').is(':checked');
    }

    // URL para wc-ajax=get_refreshed_fragments (igual que WooCommerce)
    function getWcRefreshedFragmentsUrl() {
      if (window.wc_add_to_cart_params && window.wc_add_to_cart_params.wc_ajax_url) {
        return window.wc_add_to_cart_params.wc_ajax_url.replace('%%endpoint%%', 'get_refreshed_fragments');
      }
      var base = (typeof URL_WEB !== 'undefined' && URL_WEB) ? String(URL_WEB).replace(/\/$/, '') : window.location.origin;
      return base + '/?wc-ajax=get_refreshed_fragments';
    }

    // Llamar a ?wc-ajax=get_refreshed_fragments y aplicar fragments a .total-payment (exámenes y sueroterapias)
    function requestWcRefreshedFragments(delayMs) {
      delayMs = delayMs || 200;
      var wcAjaxUrl = getWcRefreshedFragmentsUrl();
      setTimeout(function() {
        showTotalUpdating();
        $.ajax({
          url: wcAjaxUrl,
          type: 'POST',
          data: {},
          dataType: 'json',
          cache: false,
          success: function(response) {
            var fragments = (response && response.fragments) ? response.fragments : {};
            if (fragments['div.total-payment']) {
              var $totalPayment = $('.total-payment');
              if ($totalPayment.length) {
                $totalPayment.replaceWith(fragments['div.total-payment']);
                $totalPayment.removeData('original-content');
              }
            }
            if (fragments['div.empty-mini-cart']) {
              var $emptyCart = $('.empty-mini-cart');
              if ($emptyCart.length) {
                $emptyCart.replaceWith(fragments['div.empty-mini-cart']);
              }
            }
          }
        });
      }, delayMs);
    }

    // Llamar a admin-ajax del tema (misma sesión que el plugin) para obtener fragments con total correcto (domicilio exámenes + sueroterapias)
    function refreshTotalViaThemeAjax(delayMs, retries) {
      delayMs = delayMs || 250;
      retries = retries || 2;
      var attempt = 0;
      var ajaxUrl = typeof URL_AJAX !== 'undefined' ? URL_AJAX : (window.URL_AJAX || '/wp-admin/admin-ajax.php');

      function doRequest() {
        attempt++;
        showTotalUpdating();
        $.ajax({
          url: ajaxUrl,
          type: 'POST',
          data: { action: 'rogans_refresh_cart_fragments' },
          dataType: 'json',
          cache: false,
          success: function(response) {
            var fragments = (response && response.data && response.data.fragments) ? response.data.fragments : (response && response.fragments) ? response.fragments : {};
            if (fragments && Object.keys(fragments).length) {
              if (fragments['div.total-payment']) {
                var $totalPayment = $('.total-payment');
                if ($totalPayment.length) {
                  $totalPayment.replaceWith(fragments['div.total-payment']);
                  $totalPayment.removeData('original-content');
                }
              }
              if (fragments['div.empty-mini-cart']) {
                var $emptyCart = $('.empty-mini-cart');
                if ($emptyCart.length) {
                  $emptyCart.replaceWith(fragments['div.empty-mini-cart']);
                }
              }
            } else if (attempt < retries) {
              setTimeout(doRequest, 200 * attempt);
            }
          },
          error: function() {
            if (attempt < retries) {
              setTimeout(doRequest, 200 * attempt);
            }
          }
        });
      }
      setTimeout(doRequest, delayMs);
    }

    // Función dedicada para forzar actualización del total de manera agresiva
    function forceUpdateTotalFragment(retries = 3) {
      var attempt = 0;
      
      // Mostrar estado "Actualizando" antes de iniciar
      showTotalUpdating();
      
      function attemptUpdate() {
        attempt++;

        var ajaxUrlTheme = typeof URL_AJAX !== 'undefined' ? URL_AJAX : (window.URL_AJAX || '/wp-admin/admin-ajax.php');
        var fragmentUrl = ajaxUrlTheme;

        $.ajax({
          url: fragmentUrl,
          type: 'POST',
          data: { action: 'rogans_refresh_cart_fragments' },
          dataType: 'json',
          cache: false,
          success: function(response) {
            var fragments = (response && response.data && response.data.fragments) ? response.data.fragments : (response && response.fragments) ? response.fragments : {};
            if (fragments && Object.keys(fragments).length) {
              // Actualizar el fragment del total (ya trae fee domicilio exámenes + sueroterapias)
              if (fragments['div.total-payment']) {
                var $totalPayment = $('.total-payment');
                if ($totalPayment.length) {
                  $totalPayment.replaceWith(fragments['div.total-payment']);
                  $totalPayment.removeData('original-content');
                } else {
                  console.warn('No se encontró .total-payment en el DOM');
                }
              }
              if (fragments['div.empty-mini-cart']) {
                var $emptyCart = $('.empty-mini-cart');
                if ($emptyCart.length) {
                  $emptyCart.replaceWith(fragments['div.empty-mini-cart']);
                }
              }
              if (fragments['span.cart-count']) {
                var $cartCount = $('span.cart-count');
                if ($cartCount.length) {
                  $cartCount.replaceWith(fragments['span.cart-count']);
                }
              }
            } else {
              console.warn('Respuesta de fragments inválida:', response);
              if (attempt < retries) {
                setTimeout(attemptUpdate, 300 * attempt);
              }
            }
          },
          error: function(xhr, status, error) {
            console.error('Error al actualizar fragments:', error);
            if (attempt < retries) {
              setTimeout(attemptUpdate, 300 * attempt);
            }
          }
        });
      }
      
      // Esperar un momento para que el servidor procese la eliminación
      setTimeout(attemptUpdate, 200);
    };

    // Estrategia 2: Interceptar llamadas AJAX específicas de clinova
    function interceptAjaxForCart() {
      // Interceptar AJAX antes de enviar para mostrar estado "Actualizando"
      $(document).ajaxSend(function(event, xhr, settings) {
        // Verificar si es una llamada de clinova que afecta el total
        if (settings.url && settings.url.indexOf('admin-ajax.php') !== -1) {
          const requestData = settings.data || '';
          const actionMatch = (function(data){
            if (typeof data === 'string') return data;
            if (typeof data === 'object' && data !== null) {
              try { return $.param(data); } catch (e) { return ''; }
            }
            return '';
          })(requestData);
          
          // Verificar si es una acción de clinova que afecta el total
          if (actionMatch.indexOf('action=clinova_add_to_cart') !== -1 ||
              actionMatch.indexOf('action=clinova_remove_from_cart') !== -1 ||
              actionMatch.indexOf('action=clinova_update_cart_exam') !== -1 ||
              actionMatch.indexOf('action=clinova_update_all_cart_exams') !== -1 ||
              actionMatch.indexOf('action=clinova_update_all_cart_sueros') !== -1) {
            // Mostrar estado "Actualizando" antes de enviar la petición
            showTotalUpdating();
          }
        }
      });
      
      // Interceptar AJAX completado
      $(document).ajaxComplete(function(event, xhr, settings) {
        // Verificar si es una llamada de clinova
        if (settings.url && settings.url.indexOf('admin-ajax.php') !== -1) {
          const requestData = settings.data || '';
          const actionMatch = (function(data){
            if (typeof data === 'string') return data;
            if (typeof data === 'object' && data !== null) {
              try { return $.param(data); } catch (e) { return ''; }
            }
            return '';
          })(requestData);

          if (actionMatch.indexOf('action=clinova_') !== -1) {
            if (actionMatch.indexOf('action=clinova_update_all_cart_sueros') !== -1) {
              var _r = null; try { _r = xhr.responseJSON; } catch (e) {}
            }
          }
          
          // Verificar si es una acción de clinova
          if (actionMatch.indexOf('action=clinova_add_to_cart') !== -1 ||
              actionMatch.indexOf('action=clinova_remove_from_cart') !== -1 ||
              actionMatch.indexOf('action=clinova_update') !== -1 ||
              actionMatch.indexOf('action=clinova_update_cart_exam') !== -1 ||
              actionMatch.indexOf('action=clinova_update_all_cart_exams') !== -1 ||
              actionMatch.indexOf('action=clinova_update_all_cart_sueros') !== -1) {
            
            // Forzar actualización inmediata del total cuando se elimina un examen
            if (actionMatch.indexOf('action=clinova_remove_from_cart') !== -1) {
              forceUpdateTotalFragment(5); // 5 intentos para asegurar
              
              // También disparar el refresh de WooCommerce
              setTimeout(function() {
                $(document.body).trigger('wc_fragment_refresh');
              }, 100);
            }
            
            // Forzar actualización cuando se agrega un examen
            if (actionMatch.indexOf('action=clinova_add_to_cart') !== -1) {
              forceUpdateTotalFragment(3);
            }

            // Actualizar .total-payment en tiempo real cuando se actualiza modalidad (exámenes o sueroterapias). Misma sesión que el plugin vía admin-ajax.
            if (actionMatch.indexOf('action=clinova_update') !== -1 ||
                actionMatch.indexOf('action=clinova_update_cart_exam') !== -1 ||
                actionMatch.indexOf('action=clinova_update_all_cart_exams') !== -1 ||
                actionMatch.indexOf('action=clinova_update_all_cart_sueros') !== -1) {
              var responseData = null;
              try { responseData = xhr.responseJSON; } catch (e) {}
              var isSueroUpdate = actionMatch.indexOf('action=clinova_update_all_cart_sueros') !== -1;
              if (!isSueroUpdate && responseData && responseData.success && responseData.data && responseData.data.fragments) {
                applyClinovaTotalToPaymentFromResponse(responseData.data);
                setTimeout(function() { syncTotalPaymentFromClinovaMinicart(); }, 150);
                setTimeout(function() { syncTotalPaymentFromClinovaMinicart(); }, 500);
              }
              if (isSueroUpdate && responseData && responseData.success) {
                setTimeout(function() { logAllFeesAndModalidad(); }, 250);
              }
              refreshTotalViaThemeAjax(isSueroUpdate ? 350 : 200, 3);
              requestWcRefreshedFragments(isSueroUpdate ? 400 : 250);
              forceUpdateTotalFragment(5);
              setTimeout(function() {
                $(document.body).trigger('wc_fragment_refresh');
              }, 100);
            }
            
            setTimeout(function() {
              const currentState = checkClinovaCartState();
              
              // Detectar cuando se agrega el primer examen
              if (!lastCartState.hasContent && currentState.hasContent) {
                lastCartState = currentState;
                handleClinovaCartUpdate();
                return;
              }
              
              // Detectar cuando aumenta el contador
              if (currentState.count > lastCartState.count && !isHandlingUpdate) {
                lastCartState = currentState;
                handleClinovaCartUpdate();
                return;
              }
              
              // Detectar cuando disminuye el contador (eliminación)
              if (currentState.count < lastCartState.count && !isHandlingUpdate) {
                lastCartState = currentState;
                handleClinovaCartUpdate();
                // Forzar actualización del total también aquí
                forceUpdateTotalFragment(5);
                return;
              }
              
              // Actualizar estado
              lastCartState = currentState;
            }, 500);
          }
        }
      });

    };

    // Replicar lógica de exámenes para sueroterapias: al cambiar modalidad (presencial/domicilio) actualizar .total-payment con el fee
    $(document).on('change', 'input[name="clinova_modalidad_global_suero"]', function() {
      // El plugin llama a updateAllCartSueros(); esperamos a que ese AJAX termine y luego pedimos fragments (wc-ajax + tema)
      setTimeout(function() {
        requestWcRefreshedFragments(0);
        refreshTotalViaThemeAjax(0, 2);
      }, 550);
    });

    // Estrategia 3: Escuchar wc_fragment_refresh (el plugin lo dispara al actualizar modalidad exámenes Y sueroterapias)
    $(document.body).on('wc_fragment_refresh', function() {
      requestWcRefreshedFragments(150);
      setTimeout(function() {
        const currentState = checkClinovaCartState();
        
        if (!lastCartState.hasContent && currentState.hasContent) {
          lastCartState = currentState;
          handleClinovaCartUpdate();
          return;
        }
        if (currentState.count > lastCartState.count && !isHandlingUpdate) {
          lastCartState = currentState;
          handleClinovaCartUpdate();
          return;
        }
        if (currentState.count < lastCartState.count && !isHandlingUpdate) {
          lastCartState = currentState;
          handleClinovaCartUpdate();
          forceUpdateTotalFragment(5);
          return;
        }
        lastCartState = currentState;
      }, 300);
    });
    
    // Interceptar clicks directos en botones de eliminar del carrito de Clinova
    $(document).on('click', '.clinova-mini-cart-wrapper a[href*="remove"], .clinova-mini-cart-wrapper button[data-action="remove"], .clinova-mini-cart-wrapper .remove-item', function(e) {
      // Esperar a que se complete la eliminación y luego actualizar
      setTimeout(function() {
        forceUpdateTotalFragment(5);
        handleClinovaCartUpdate();
      }, 500);
    });
    
    // Estrategia 4: Monitorear cambios en el wrapper (para cuando está vacío y se llena)
    function monitorClinovaCartWrapper() {
      setInterval(function() {
        if (isHandlingUpdate) return;
        
        const currentState = checkClinovaCartState();
        
        // Detectar cuando se agrega el primer examen (wrapper pasa de vacío a tener contenido)
        if (!lastCartState.hasContent && currentState.hasContent) {
          lastCartState = currentState;
          handleClinovaCartUpdate();
          openSidebarCart();
          return;
        }
        
        // Detectar cuando aumenta el contador
        if (currentState.count > lastCartState.count) {
          lastCartState = currentState;
          handleClinovaCartUpdate();
          return;
        }
        
        // Detectar cuando disminuye el contador (eliminación)
        if (currentState.count < lastCartState.count) {
          lastCartState = currentState;
          handleClinovaCartUpdate();
          // Forzar actualización del total
          forceUpdateTotalFragment(5);
          return;
        }
        
        // Actualizar estado
        if (currentState.count !== lastCartState.count || 
            currentState.hasContent !== lastCartState.hasContent) {
          lastCartState = currentState;
        }
      }, 500);
      
    };

    // Función centralizada para manejar la actualización del carrito de clinova
    function handleClinovaCartUpdate() {
      // Evitar múltiples llamadas simultáneas
      if(isHandlingUpdate) {
        return;
      }
      
      isHandlingUpdate = true;
      openSidebarCart();
      updateCartCount();

      // Actualizar el fragment del total cuando se agregan o eliminan exámenes
      // Usar la función dedicada que tiene reintentos
      forceUpdateTotalFragment(3);

      // También disparar el refresh de WooCommerce
      setTimeout(function() {
        $(document.body).trigger('wc_fragment_refresh');
      }, 100);

      // Ocultar el loader después de un tiempo y permitir nuevas actualizaciones
      setTimeout(function() {
        $("#loading-cart").addClass("invisible opacity-0 -z-[99999]").removeClass("visible opacity-100 z-[99999]");
        $("body").removeClass("overflow-hidden");
        isHandlingUpdate = false;
      }, 1000);
    };

    // Inicializar todas las estrategias de detección
    $(document).ready(function() {
      // Inicializar el estado actual
      lastCartState = checkClinovaCartState();
      
      initClinovaCartObserver();
      interceptAjaxForCart();
      monitorClinovaCartWrapper();
    });

    // (Acordeón del mini-cart eliminado: ahora el carrito es un listado unificado
    // de exámenes, sueroterapias y productos sin secciones colapsables.)

    // Single Product - Manejar submit del formulario de agregar al carrito
    if(typeof IS_PRODUCT !== 'undefined' && IS_PRODUCT === true) {
      
    }

    //setTimeout(showBody, 100);

  };

  (function initWhenjQueryReady() {
    if(typeof jQuery === 'undefined' || !jQuery.fn) {
      setTimeout(initWhenjQueryReady, 50);
      return;
    }

    jQuery(function ($) {
      var needsNice = $('.custom-nice-select, .variations select').length > 0;
      var needsNoUiSlider = $('.price-slider').length > 0;
    
      var chain = Promise.resolve();
      if (needsNice)       chain = chain.then(() => ensureNiceSelect($));
      if (needsNoUiSlider) chain = chain.then(() => ensureNoUiSlider());
    
      chain
        .catch(function (err) { console.warn('Loader error:', err); })
        .finally(function () {
          if (needsNice && $.fn && $.fn.niceSelect) {
            $('.custom-nice-select, .variations select').each(function () {
              var $sel = $(this);
              $sel.next('.nice-select').length ? $sel.niceSelect('update') : $sel.niceSelect();
            });
          }
          initComponents($);
        });
    });
  })();
})();