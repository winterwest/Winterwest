$(document).ready(function() {

    /* For the sticky navigation */
    $('.js--section-about').waypoint(function(direction) {
        if (direction == "down") {
            $('nav').addClass('sticky');
        } else {
            $('nav').removeClass('sticky');
        }
    }, {
      offset: '60px;'
    });

    
    
    /* Scroll on buttons */
    $('.js--scroll-to-hayforsale').click(function () {
        $('html, body').animate({scrollTop: $('.js--section-hayforsale').offset().top}, 3000);
    });  
    
    $('.js--scroll-to-start').click(function () {
        $('html, body').animate({scrollTop: $('.js--section-about').offset().top}, 1000);
    });  

    
    /* Navigation scroll */
    
    $(function() {
      $('a[href*=#]:not([href=#])').click(function() {
        if (location.pathname.replace(/^\//,'') == this.pathname.replace(/^\//,'') && location.hostname == this.hostname) {
          var target = $(this.hash);
          target = target.length ? target : $('[name=' + this.hash.slice(1) +']');
          if (target.length) {
            $('html,body').animate({
              scrollTop: target.offset().top
            }, 1000);
            return false;
          }
        }
      });
    });
    
    /* Animations on scroll */
    $('.js--wp-1').waypoint(function(direction) {
        $('.js--wp-1').addClass('animated fadeIn');    
    }, {
        offset: '50%'
    });

    $('.js--wp-2').waypoint(function(direction) {
        $('.js--wp-2').addClass('animated fadeInUp');    
    }, {
        offset: '50%'
    });

    $('.js--wp-3').waypoint(function(direction) {
        $('.js--wp-3').addClass('animated fadeIn');    
    }, {
        offset: '50%'
    });

    /* Mobile Navigation */
    $('.js--nav-icon').click(function() {
        var nav = $('.js--main-nav');
        var icon = $('.js--nav-icon i');
        
        /* nav.slideToggle(200); */
        nav.toggleClass('showNav'); /* USER FIX */
        
        if (icon.hasClass('ion-navicon-round')) {
            icon.addClass('ion-close-round');
            icon.removeClass('ion-navicon-round');
        } else {
            icon.removeClass('ion-close-round');
            icon.addClass('ion-navicon-round');
        }
    });
    
//    /* Maps */
//    var map = new GMaps({
//      div: '.map',
//      lat: 40.943131, //40.982451,
//      lng: -74.91, //-74.945112,
//      zoom: 13
//    });
//    
//    map.addMarker({
//      lat: 40.943131, //40.980985,
//      lng: -74.962847, //-74.959720,
//      title: 'Winterwest Farm',
//      infoWindow: {
//        content: '<p>Winterwest Farm</p>'
//      }
//      
//    });
    
    
    // function initMap() {
    //     var mapDiv = document.getElementById('map');
    //     //alert("Got to here!!!");
    //     var map = new google.maps.Map(mapDiv, {
    //       center: {lat: 40.943131, lng: -74.962847},
    //       zoom: 13
    //     });
        
        // map.addMarker({
        //     lat: 40.943131,
        //     lng: -74.962847,
        //     title: 'Winterwest Farm',
        //     infoWindow: { content: '<p>Winterwest Farm</p>' }
        // });
  //  }
});