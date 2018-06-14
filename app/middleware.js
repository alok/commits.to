import subdomainHandler from 'express-subdomain-handler'
import _ from 'lodash'

import app from './express'
import { APP_DOMAIN } from '../app/config'
import sendMail from '../lib/mail'
import log, { deSequelize } from '../lib/logger'
import { Promises, Users } from '../models'

import { parsePromise, parsePromiseWithIp } from '../lib/parse/promise'
import { isBotFromUserAgent } from '../lib/parse/url'
import isValidUrl from '../lib/parse/url'

const pageWithStatus = ({
  message, reason = {}, res = {}, template, status
}) => {
  log.error(message, reason)
  return res.status(status).render(template, { ...reason })
}

const renderErrorPage = (opts) =>
  pageWithStatus({ status: 404, template: '404', ...opts })

app.use(subdomainHandler({
  baseUrl: APP_DOMAIN,
  prefix: '_s',
  logger: true
}))

// validates all requests with a :user param
app.param('user', function(req, res, next, param) {
  log.debug('user check', param)

  Users.findOne({
    where: {
      username: req.params.user,
    }
  }).then(user => {
    if (user) {
      req.user = user
      return next()
    }
    return res.redirect(`//${APP_DOMAIN}/sign-up`)
  })
})

app.param('urtext', function(req, res, next, param) {
  const { originalUrl: url, useragent } = req
  log.debug('url check', param)
  // handle invalid requests with a 404
  if (!isValidUrl({ url })) {
    const reason = { url, useragent: _.pickBy(useragent) }
    return renderErrorPage({ message: 'invalid url', reason, res })
  }
  return next()
})

// promise parsing
app.param('urtext', function(req, res, next) {
  const { ip, originalUrl: urtext, user: { username } = {} } = req

  const isBot = isBotFromUserAgent({ req })
  let parsedPromise = parsePromise({ username, urtext })
  let foundPromise = undefined

  if (!parsedPromise) {
    return renderErrorPage({ message: 'unparseable promise', res })
  }

  return Promises.find({
    where: {
      id: parsedPromise.id
    },
  }).then(async(p) => {
    foundPromise = p
    let toLog = { level: 'debug', state: 'exists' }

    if (!foundPromise || !foundPromise.urtext) {
      if (isBot && !foundPromise) { // hasn't been captcha validated
        const reason = { username, urtext, isBot }

        return pageWithStatus({
          template: 'captcha',
          status: 404,
          message: 'bot creation attempt',
          reason,
          res
        })
      }

      parsedPromise = await parsePromiseWithIp({ username, urtext, ip })
        .catch((reason) =>
          renderErrorPage({ message: 'promise parsing error', reason, res }))

      if (parsedPromise) {
        const useragent = JSON.stringify(_.pickBy(req.useragent))
        foundPromise = await Promises
          .upsert({ ...parsedPromise, ip, useragent })
          .catch((reason) =>
            renderErrorPage({ message: 'promise creation error', reason, res }))


        toLog = { level: 'info', state: 'created' }
        sendMail({ // send @dreev an email
          to: 'dreeves@gmail.com',
          subject: foundPromise.id,
          text: `New promise created by: ${username}: ${foundPromise.id}`,
        })
      }
    }

    return Promises.findOne({
      where: {
        id: parsedPromise.id,
      },
    }).then((promise) => {
      log[toLog.level](`promise ${toLog.state}`, deSequelize(promise))
      req.parsedPromise = parsedPromise // add to the request object
      // do our own JOIN
      req.promise = promise
      req.promise.user = req.user
      req.promise.setUser(req.user)

      return next()
    })
  }) // couldn't handle this promise
    .catch((reason) =>
      renderErrorPage({ message: 'promise finding error', reason, res }))
})
