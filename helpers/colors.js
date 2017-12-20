import moment from 'moment-timezone'
import Handlebars from 'handlebars'

Handlebars.registerHelper('creditColor', function(credit) {
  let color = 'green';
  
  switch (true) {
    case (credit == null):
      color = '' //FIXME
      break
    case (credit < .5):
      color = 'red'
      break
    case (credit < .9):
      color = 'orange'
      break
    case (credit < 1):
      color = 'blue'
      break
  }
  
  // console.log('creditColor', credit, color)
  return `credit--status-${color}`
});

Handlebars.registerHelper('dueColor', function(diff) {
  let color = 'gray'
  
  switch (true) {
    case(diff < -(24 * 5)):
      color = 'green'
      break
    case(diff < -(24 * 2)):
      color = 'blue'
      break
    case(diff < -24):
      color = 'yellow'
      break
      
    case(diff < 0):
      color = 'orange'  
      break
    case (diff > 0):
      color = 'red'
  }
  
  // console.log('dueColor', diff, color)
  return `promise--status-${color}`
});