$(function() {
  // Session

  var session = {
    faults: 0
  };

  // Functions

  function join(handle, avatar, callback) {
    $.ajax({
      url: '/join',
      type: 'POST',
      data: {
        handle: handle,
        avatar: avatar
      },
      dataType: 'json',
      success: function(data) {
        if (data) {
          session = data;
          session.time = 0;
          session.faults = 0;

          $(window).unload(part);

          clearAlerts();

          $('#join').slideUp(function() {
            $('#post').slideDown(function() {
              $('#messages').fadeIn();
            });
          });

          recv();
        }
      },
      error: function(res, status, error) {
        if (res.status === 0) {
          addAlert("Unable to connect to the server.", true);
        } else if (res.responseText) {
          addAlert(res.responseText);
        }
      },
      complete: function(res, status) {
        callback();
      }
    });
  }

  function recv() {
    if (session.faults > 3) {
      session.faults = 0;
      session.id = null;

      $(window).unbind('unload');

      addAlert("Connection lost.", true);

      $('#messages').fadeOut(function() {
        $('#post').slideUp(function() {
          $('#join').slideDown();
        });
      });

      return;
    }

    $.ajax({
      url: '/recv',
      type: 'GET',
      data: {
        id: session.id,
        time: session.time
      },
      dataType: 'json',
      success: function(data) {
        if (data) {
          $.each(data, function(index, message) {
            var $element = $('<p/>');

            if (message.handle) {
              $element.text("<" + message.handle + "> " + message.text);
            } else {
              $element.text("-- " + message.text);
            }

            $('#messages').prepend($element);

            if (message.time > session.time) {
              session.time = message.time;
            }
          });

          session.faults = 0;
        } else {
          session.faults += 1;
        }

        recv();
      },
      error: function(res, status, error) {
        session.faults += 1;

        setTimeout(recv, 10000);
      },
      timeout: 60000
    });
  }

  function post(text) {
    $.ajax({
      url: '/post',
      type: 'POST',
      data: {
        id: session.id,
        text: text
      },
      error: function(res, status, error)  {
        if (res.status === 0) {
          addAlert("Unable to connect to the server.", true);
        } else if (res.responseText) {
          addAlert(res.responseText);
        }
      }
    });
  }

  function part() {
    $.post('/part', {
      id: session.id
    });
  }

  function addAlert(text, fatal) {
    duration = fatal ? 8000 : 3000;

    var $alert = $('<p/>', {
      text: text
    });

    if (fatal) {
      $alert.addClass('fatal');
    }

    $alert.hide();
    $('#alerts').prepend($alert);

    $alert.slideDown().delay(duration).slideUp(function() {
      $alert.remove();
    });
  }

  function clearAlerts() {
    var $alerts = $('#alerts');

    $alerts.fadeOut(function() {
      $alerts.children().remove();
      $alerts.show();
    });
  }

  // Bindings

  $('#join').submit(function() {
    var $handle = $(this.handle);
    var $submit = $('#join input[type=submit]');
    
    if ($handle.val()) {
      $submit.attr('disabled', 'disabled');
      join($handle.val(), $(this.avatar).val(), function() {
        $submit.removeAttr('disabled');
      });
    } else {
      addAlert("Handle can't be blank.");
    }
    
    return false;
  });

  $('#post').submit(function() {
    var $text = $(this.text);

    if ($text.val()) {
      post($text.val());
      $text.val("");
    }

    $text.focus();

    return false;
  }).keydown(function(event) {
    if (event.keyCode === 13) {
      if (event.altKey) {
        $(this.text).val(function(index, value) {
          return value + "\n";
        });
      } else {
        $(this).submit();
      }

      return false;
    }
  });
});
