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
            if (message.handle) {
              addMessage(message.handle, message.avatar, message.text);
            } else {
              addNotice(message.text);
            }

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

  function addMessage(handle, avatar, text) {
    var $clear = $('<div/>', {
      'class': 'clear'
    });

    var $message = $('<div/>', {
      'class': 'message'
    });

    $message.addClass(avatar);

    var $info = $('<div/>', {
      'class': 'info'
    }).append($('<img>', {
      'src': '/images/' + avatar + '.png'
    })).append($('<span>', {
      text: handle
    }));

    var $bubble = $('<div/>', {
      'class': 'bubble',
      text: text
    });

    $bubble.css({
      opacity: 0,
      'padding': '0'
    });

    $bubble.animate({
      opacity: 1,
      paddingTop: '25px',
      paddingRight: '30px',
      paddingBottom: '25px',
      paddingLeft: '30px',
    }, 250);

    $message.append($info).append($bubble);

    $('#messages').prepend($clear).prepend($message);
  }

  function addNotice(text) {
    var $clear = $('<div/>', {
      'class': 'clear'
    });

    var $notice = $('<div/>', {
      'class': 'notice',
      text: "-- " + text
    });

    $('#messages').prepend($clear).prepend($notice);
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
