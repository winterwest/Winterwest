function initMap() {
    var mapDiv = document.getElementById('map');
    //alert("Got to here!!!");
    var map = new google.maps.Map(mapDiv, {
        center: {lat: 40.943131, lng: -74.91},
        zoom: 13
    });
    var marker = new google.maps.Marker({
        position : {lat: 40.943131, lng: -74.962847},
        map: map,
        title: 'Winterwest Farm',
        infoWindow: { content: '<p>Winterwest Farm</p>' }
    });
}