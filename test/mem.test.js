/*
  MIT License,
  Copyright (c) 2010-2021, Richard Rodger and other contributors.
*/

'use strict'

const Util = require('util')

const Assert = require('assert')
const Seneca = require('seneca')
const Shared = require('seneca-store-test')

const Lab = require('@hapi/lab')
const Code = require('@hapi/code')
const { expect } = Code
const lab = (exports.lab = Lab.script())
const { describe, beforeEach } = lab
const it = make_it(lab)

function makeSenecaForTest() {
  const seneca = Seneca({
    log: 'silent',
    default_plugins: { 'mem-store': false },
  })

  seneca.use({ name: '..', tag: '1' })

  if (seneca.version >= '2.0.0') {
    seneca.use('entity', { mem_store: false })
  }

  return seneca
}

const seneca = Seneca({
  log: 'silent',
  default_plugins: { 'mem-store': false },
})
seneca.use({ name: '..', tag: '1' })

const senecaMerge = Seneca({
  log: 'silent',
})
senecaMerge.use({ name: '..', tag: '1' }, { merge: false })

if (seneca.version >= '2.0.0') {
  seneca.use('entity', { mem_store: false })
  senecaMerge.use('entity', { mem_store: false })
}

const seneca_test = Seneca({ require })
  .test()
  .use('promisify')
  .use('entity', { mem_store: false })
//.use('..')

const test_opts = {
  seneca: seneca_test,
  name: 'mem-store',
}

Shared.test.init(lab, test_opts)
Shared.test.keyvalue(lab, test_opts)

describe('mem-store tests', function () {
  Shared.basictest({
    seneca: seneca,
    senecaMerge: senecaMerge,
    script: lab,
  })

  Shared.limitstest({
    seneca: seneca,
    script: lab,
  })

  // TODO: does not seem to include ents that are equvalent for sorting
  Shared.sorttest({
    seneca: seneca,
    script: lab,
  })

  Shared.upserttest({
    seneca: makeSenecaForTest(),
    script: lab
  })

  it('export-native', function (fin) {
    Assert.ok(
      seneca.export('mem-store$1/native') || seneca.export('mem-store/1/native')
    )
    fin()
  })

  it('custom-test', function (fin) {
    seneca.test(fin)

    var ent = seneca.make('foo', { id$: '0', q: 1 })

    ent.save$(function (err) {
      Assert.ok(null === err)

      seneca.act('role:mem-store, cmd:export', function (err, exported) {
        var expected =
          '{"undefined":{"foo":{"0":{"entity$":"-/-/foo","q":1,"id":"0"}}}}'

        Assert.ok(null === err)
        Assert.equal(exported.json, expected)

        var data = JSON.parse(exported.json)
        data['undefined']['foo']['1'] = { entity$: '-/-/foo', val: 2, id: '1' }

        seneca.act(
          'role:mem-store, cmd:import',
          { json: JSON.stringify(data) },
          function (err) {
            Assert.ok(null === err)

            seneca.make('foo').load$('1', function (err, foo) {
              Assert.ok(null === err)
              Assert.equal(2, foo.val)

              fin()
            })
          }
        )
      })
    })
  })

  it('import', function (fin) {
    seneca.test(fin)

    seneca.act(
      'role:mem-store, cmd:import',
      { json: JSON.stringify({ foo: { bar: { aaa: { id: 'aaa', a: 1 } } } }) },
      function (err) {
        seneca.make('foo/bar').load$('aaa', function (err, aaa) {
          Assert.equal('$-/foo/bar;id=aaa;{a:1}', aaa.toString())

          seneca.act(
            'role:mem-store, cmd:import, merge:true',
            {
              json: JSON.stringify({
                foo: {
                  bar: {
                    aaa: { id: 'aaa', a: 2 },
                    bbb: { id: 'bbb', a: 3 },
                  },
                },
              }),
            },
            function (err) {
              seneca.make('foo/bar').load$('aaa', function (err, aaa) {
                Assert.equal('$-/foo/bar;id=aaa;{a:2}', aaa.toString())

                seneca.make('foo/bar').load$('bbb', function (err, bbb) {
                  Assert.equal('$-/foo/bar;id=bbb;{a:3}', bbb.toString())

                  seneca.act('role:mem-store, cmd:export', function (err, out) {
                    Assert.equal(
                      '{"foo":{"bar":{"aaa":{"id":"aaa","a":2},"bbb":{"id":"bbb","a":3}}}}',
                      out.json
                    )
                    fin()
                  })
                })
              })
            }
          )
        })
      }
    )
  })

  it('generate_id', function (fin) {
    seneca.make$('foo', { a: 1 }).save$(function (err, out) {
      if (err) return fin(err)

      Assert(6 === out.id.length)
      fin()
    })
  })

  it('fields', function (fin) {
    seneca.test(fin)

    var ent = seneca.make('foo', { id$: 'f0', a: 1, b: 2, c: 3 })

    ent.save$(function (err, foo0) {
      foo0.list$({ id: 'f0', fields$: ['a', 'c'] }, function (err, list) {
        expect(list[0].toString()).equal('$-/-/foo;id=f0;{a:1,c:3}')

        foo0.load$(
          { id: 'f0', fields$: ['a', 'not-a-fields'] },
          function (err, out) {
            expect(out.toString()).equal('$-/-/foo;id=f0;{a:1}')
            fin()
          }
        )
      })
    })
  })

  it('in-query', function (fin) {
    seneca.test(fin)

    seneca.make('zed', { p1: 'a', p2: 10 }).save$()
    seneca.make('zed', { p1: 'b', p2: 20 }).save$()
    seneca.make('zed', { p1: 'c', p2: 30 }).save$()
    seneca.make('zed', { p1: 'a', p2: 40 }).save$()
    seneca.ready(function () {
      seneca.make('zed').list$({ p1: 'a' }, function (err, list) {
        //console.log(err,list)
        expect(list.length).equal(2)

        seneca.make('zed').list$({ p1: ['a'] }, function (err, list) {
          //console.log(err,list)
          expect(list.length).equal(2)

          seneca.make('zed').list$({ p1: ['a', 'b'] }, function (err, list) {
            //console.log(err,list)
            expect(list.length).equal(3)
            fin()
          })
        })
      })
    })
  })

  it('mongo-style-query', function (fin) {
    seneca.test(fin)

    seneca.make('mongo', { p1: 'a', p2: 10 }).save$()
    seneca.make('mongo', { p1: 'b', p2: 20 }).save$()
    seneca.make('mongo', { p1: 'c', p2: 30 }).save$()
    seneca.make('mongo', { p1: 'a', p2: 40 }).save$()

    seneca.ready(function () {
      let m = seneca.make('mongo')

      m.list$({ p2: { $gte: 20 } }, function (err, list) {
        //console.log(err,list)
        expect(list.length).equal(3)

        m.list$({ p2: { $gt: 20 } }, function (err, list) {
          //console.log(err,list)
          expect(list.length).equal(2)

          m.list$({ p2: { $lt: 20 } }, function (err, list) {
            //console.log(err,list)
            expect(list.length).equal(1)

            m.list$({ p2: { $lte: 20 } }, function (err, list) {
              //console.log(err,list)
              expect(list.length).equal(2)

              m.list$({ p2: { $ne: 20 } }, function (err, list) {
                //console.log(err,list)
                expect(list.length).equal(3)

                m.list$({ p1: { $in: ['a', 'b'] } }, function (err, list) {
                  // console.log(err,list)
                  expect(list.length).equal(3)

                  m.list$({ p1: { $nin: ['a', 'b'] } }, function (err, list) {
                    // console.log(err,list)
                    expect(list.length).equal(1)

                    // ignore unknown constraints
                    m.list$(
                      { p1: { $notaconstraint: 'whatever' } },
                      function (err, list) {
                        // console.log(err,list)
                        expect(list.length).equal(4)

                        fin()
                      }
                    )
                  })
                })
              })
            })
          })
        })
      })
    })
  })

  describe('internal utilities', () => {
    const mem_store = seneca.export('mem-store')

    describe('is_new', () => {
      describe('export', () => {
        it('is exported', fin => {
          expect(null == mem_store.init).to.equal(false)

          const { init } = mem_store
          expect(null == init.intern).to.equal(false)

          const { intern } = init
          expect(typeof intern.is_new).to.equal('function')

          fin()
        })
      })

      describe('behavior', () => {
        const { intern } = mem_store.init

        describe('passed a null', () => {
          it('returns a correct value', fin => {
            const result = intern.is_new(null)
            expect(result).to.equal(false)

            fin()
          })
        })

        describe('passed an entity that has not been saved yet', () => {
          let product

          beforeEach(() => {
            product = seneca.make('product')
              .data$({ label: 'Legions of Rome' })
          })

          it('returns a correct value', fin => {
            const result = intern.is_new(product)
            expect(result).to.equal(true)

            fin()
          })
        })

        describe('passed an entity that has been saved before', () => {
          let product

          beforeEach(() => {
            return new Promise((resolve, reject) => {
              seneca.make('product')
                .data$({ label: 'Legions of Rome' })
                .save$((err, out) => {
                  if (err) {
                    return reject(err)
                  }

                  product = out

                  return resolve()
                })
            })
          })

          it('returns a correct value', fin => {
            const result = intern.is_new(product)
            expect(result).to.equal(false)

            fin()
          })
        })

        describe('passed an entity that has not been saved before, but has an id arg', () => {
          let product

          beforeEach(() => {
            product = seneca.make('product')
              .data$({ id: 'my_precious', label: 'Legions of Rome' })
          })

          it('returns a correct value', fin => {
            const result = intern.is_new(product)
            expect(result).to.equal(false)

            fin()
          })
        })
      })
    })
  })
})

function make_it(lab) {
  return function it(name, opts, func) {
    if ('function' === typeof opts) {
      func = opts
      opts = {}
    }

    lab.it(
      name,
      opts,
      Util.promisify(function (x, fin) {
        func(fin)
      })
    )
  }
}
