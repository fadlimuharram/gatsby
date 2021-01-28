const { spawn } = require(`child_process`)
const path = require(`path`)
const { murmurhash } = require(`babel-plugin-remove-graphql-queries`)
const { readPageData } = require(`gatsby/dist/utils/page-data`)
const { stripIgnoredCharacters } = require(`gatsby/graphql`)
const fs = require(`fs-extra`)

jest.setTimeout(100000)

const publicDir = path.join(process.cwd(), `public`)

const gatsbyBin = path.join(`node_modules`, `.bin`, `gatsby`)

const manifest = {}
const filesToRevert = {}

function runGatsbyWithRunTestSetup(runNumber = 1) {
  return function beforeAllImpl() {
    return new Promise(resolve => {
      const gatsbyProcess = spawn(gatsbyBin, [`build`, `--write-to-file`], {
        stdio: [`inherit`, `inherit`, `inherit`, `inherit`],
        env: {
          ...process.env,
          NODE_ENV: `production`,
          GATSBY_EXPERIMENTAL_PAGE_BUILD_ON_DATA_CHANGES: `1`, // temporary - will remove when mode is made default,
          ARTIFACTS_RUN_SETUP: runNumber.toString(),
        },
      })

      gatsbyProcess.on(`exit`, () => {
        manifest[runNumber] = {
          generated: fs
            .readFileSync(
              path.join(process.cwd(), `.cache`, `newPages.txt`),
              `utf-8`
            )
            .split(`\n`)
            .filter(Boolean),
          removed: fs
            .readFileSync(
              path.join(process.cwd(), `.cache`, `deletedPages.txt`),
              `utf-8`
            )
            .split(`\n`)
            .filter(Boolean),
          ...fs.readJSONSync(
            path.join(process.cwd(), `.cache`, `build-manifest-for-test-1.json`)
          ),
        }

        fs.outputJSONSync(
          path.join(__dirname, `__debug__`, `manifest-${runNumber}.json`),
          manifest[runNumber],
          {
            spaces: 2,
          }
        )

        fs.copySync(
          path.join(process.cwd(), `public`, `chunk-map.json`),
          path.join(__dirname, `__debug__`, `chunk-map-${runNumber}.json`)
        )

        fs.copySync(
          path.join(process.cwd(), `public`, `webpack.stats.json`),
          path.join(__dirname, `__debug__`, `webpack.stats-${runNumber}.json`)
        )

        resolve()
      })
    })
  }
}

const titleQuery = `
  {
    site {
      siteMetadata {
        title
      }
    }
  }
`

const authorQuery = `
  {
    site {
      siteMetadata {
        author
      }
    }
  }
`

const githubQuery = `
  {
    site {
      siteMetadata {
        github
      }
    }
  }
`

const moreInfoQuery = `
  {
    site {
      siteMetadata {
        moreInfo
      }
    }
  }
`

function hashQuery(query) {
  const text = stripIgnoredCharacters(query)
  const hash = murmurhash(text, `abc`)
  return String(hash)
}

const globalQueries = [githubQuery, moreInfoQuery]

const pagePathToFilePath = {
  html: pagePath => path.join(`public`, pagePath, `index.html`),
  "page-data": pagePath =>
    path.join(
      `public`,
      `page-data`,
      pagePath === `/` ? `index` : pagePath,
      `page-data.json`
    ),
}

function assertFileExistenceForPagePaths({ pagePaths, type, shouldExist }) {
  if (![`html`, `page-data`].includes(type)) {
    throw new Error(`Unexpected type`)
  }

  test.each(pagePaths)(
    `${type} file for "%s" ${shouldExist ? `exists` : `DOESN'T exist`}`,
    async pagePath => {
      const filePath = pagePathToFilePath[type](pagePath)
      const exists = await new Promise(resolve => {
        fs.stat(filePath, err => {
          resolve(err === null)
        })
      })

      expect(exists).toBe(shouldExist)
    }
  )
}

function assertWebpackBundleChanges({ browser, ssr, runNumber }) {
  describe(`webpack bundle invalidation`, () => {
    it(`browser bundle ${browser ? `DID` : `DIDN'T`} change`, () => {
      if (browser) {
        expect(manifest[runNumber].changedBrowserCompilationHash).not.toEqual(
          `not-changed`
        )
      } else {
        expect(manifest[runNumber].changedBrowserCompilationHash).toEqual(
          `not-changed`
        )
      }
    })

    it(`ssr bundle ${ssr ? `DID` : `DIDN'T`} change`, () => {
      if (ssr) {
        expect(manifest[runNumber].changedSsrCompilationHash).not.toEqual(
          `not-changed`
        )
      } else {
        expect(manifest[runNumber].changedSsrCompilationHash).toEqual(
          `not-changed`
        )
      }
    })
  })
}

beforeAll(done => {
  fs.removeSync(path.join(__dirname, `__debug__`))

  const gatsbyCleanProcess = spawn(gatsbyBin, [`clean`], {
    stdio: [`inherit`, `inherit`, `inherit`, `inherit`],
    env: {
      ...process.env,
      NODE_ENV: `production`,
    },
  })

  gatsbyCleanProcess.on(`exit`, () => {
    done()
  })
})

afterAll(() => {
  Object.entries(filesToRevert).forEach(([filePath, fileContent]) => {
    fs.writeFileSync(filePath, fileContent)
  })
})

describe(`First run (baseline)`, () => {
  const runNumber = 1

  beforeAll(runGatsbyWithRunTestSetup(runNumber))

  describe(`Static Queries`, () => {
    test(`are written correctly when inline`, async () => {
      const queries = [titleQuery, ...globalQueries]
      const pagePath = `/inline/`

      const { staticQueryHashes } = await readPageData(publicDir, pagePath)

      expect(staticQueryHashes.sort()).toEqual(queries.map(hashQuery).sort())
    })

    test(`are written correctly when imported`, async () => {
      const queries = [titleQuery, ...globalQueries]
      const pagePath = `/import/`

      const { staticQueryHashes } = await readPageData(publicDir, pagePath)

      expect(staticQueryHashes.sort()).toEqual(queries.map(hashQuery).sort())
    })

    test(`are written correctly when dynamically imported`, async () => {
      const queries = [titleQuery, ...globalQueries]
      const pagePath = `/dynamic/`

      const { staticQueryHashes } = await readPageData(publicDir, pagePath)

      expect(staticQueryHashes.sort()).toEqual(queries.map(hashQuery).sort())
    })

    test(`are written correctly in jsx`, async () => {
      const queries = [titleQuery, ...globalQueries]
      const pagePath = `/jsx/`

      const { staticQueryHashes } = await readPageData(publicDir, pagePath)

      expect(staticQueryHashes.sort()).toEqual(queries.map(hashQuery).sort())
    })

    test(`are written correctly in tsx`, async () => {
      const queries = [titleQuery, ...globalQueries]
      const pagePath = `/tsx/`

      const { staticQueryHashes } = await readPageData(publicDir, pagePath)

      expect(staticQueryHashes.sort()).toEqual(queries.map(hashQuery).sort())
    })

    test(`are written correctly in typescript`, async () => {
      const queries = [titleQuery, ...globalQueries]
      const pagePath = `/typescript/`

      const { staticQueryHashes } = await readPageData(publicDir, pagePath)

      expect(staticQueryHashes.sort()).toEqual(queries.map(hashQuery).sort())
    })

    test(`are written correctly when nesting imports`, async () => {
      const queries = [titleQuery, authorQuery, ...globalQueries]
      const pagePath = `/import-import/`

      const { staticQueryHashes } = await readPageData(publicDir, pagePath)

      expect(staticQueryHashes.sort()).toEqual(queries.map(hashQuery).sort())
    })

    test(`are written correctly when nesting dynamic imports`, async () => {
      const queries = [titleQuery, ...globalQueries]
      const pagePath = `/dynamic-dynamic/`

      const { staticQueryHashes } = await readPageData(publicDir, pagePath)

      expect(staticQueryHashes.sort()).toEqual(queries.map(hashQuery).sort())
    })

    test(`are written correctly when nesting a dynamic import in a regular import`, async () => {
      const queries = [titleQuery, authorQuery, ...globalQueries]
      const pagePath = `/import-dynamic/`

      const { staticQueryHashes } = await readPageData(publicDir, pagePath)

      expect(staticQueryHashes.sort()).toEqual(queries.map(hashQuery).sort())
    })

    test(`are written correctly when nesting a regular import in a dynamic import`, async () => {
      const queries = [titleQuery, ...globalQueries]
      const pagePath = `/dynamic-import/`

      const { staticQueryHashes } = await readPageData(publicDir, pagePath)

      expect(staticQueryHashes.sort()).toEqual(queries.map(hashQuery).sort())
    })

    test(`are written correctly with circular dependency`, async () => {
      const queries = [titleQuery, ...globalQueries]
      const pagePath = `/circular-dep/`

      const { staticQueryHashes } = await readPageData(publicDir, pagePath)

      expect(staticQueryHashes.sort()).toEqual(queries.map(hashQuery).sort())
    })

    test(`are written correctly when using gatsby-browser`, async () => {
      const queries = [...globalQueries]
      const pagePath = `/gatsby-browser/`

      const { staticQueryHashes } = await readPageData(publicDir, pagePath)

      expect(staticQueryHashes.sort()).toEqual(queries.map(hashQuery).sort())
    })
  })

  const expectedPages = [`stale-pages/stable`, `stale-pages/only-in-first`]
  const unexpectedPages = [`stale-pages/only-not-in-first`]

  describe(`html files`, () => {
    const type = `html`

    describe(`should have expected html files`, () => {
      assertFileExistenceForPagePaths({
        pagePaths: expectedPages,
        type,
        shouldExist: true,
      })
    })

    describe(`shouldn't have unexpected html files`, () => {
      assertFileExistenceForPagePaths({
        pagePaths: unexpectedPages,
        type,
        shouldExist: false,
      })
    })

    it(`should create all html files`, () => {
      expect(manifest[runNumber].generated.sort()).toEqual(
        manifest[runNumber].allPages.sort()
      )
    })
  })

  describe(`page-data files`, () => {
    const type = `page-data`

    describe(`should have expected page-data files`, () => {
      assertFileExistenceForPagePaths({
        pagePaths: expectedPages,
        type,
        shouldExist: true,
      })
    })

    describe(`shouldn't have unexpected page-data files`, () => {
      assertFileExistenceForPagePaths({
        pagePaths: unexpectedPages,
        type,
        shouldExist: false,
      })
    })
  })

  // first run - this means bundles changed (from nothing to something)
  assertWebpackBundleChanges({ browser: true, ssr: true, runNumber })
})

describe(`Second run (different pages created, data changed)`, () => {
  const runNumber = 2

  const expectedPagesToBeGenerated = [
    `/stale-pages/only-not-in-first`,
    `/page-query-changing-data-but-not-id/`,
    `/page-query-dynamic-2/`,
    `/static-query-result-tracking/should-invalidate/`,
  ]

  const expectedPagesToRemainFromPreviousBuild = [
    `/stale-pages/stable/`,
    `/page-query-stable/`,
    `/page-query-changing-but-not-invalidating-html/`,
    `/static-query-result-tracking/stable/`,
    `/static-query-result-tracking/rerun-query-but-dont-recreate-html/`,
  ]

  const expectedPages = [
    // this page should remain from first build
    ...expectedPagesToRemainFromPreviousBuild,
    // those pages should have been (re)created
    ...expectedPagesToBeGenerated,
  ]

  const unexpectedPages = [
    `/stale-pages/only-in-first/`,
    `/page-query-dynamic-1/`,
  ]

  beforeAll(runGatsbyWithRunTestSetup(runNumber))

  describe(`html files`, () => {
    const type = `html`

    describe(`should have expected html files`, () => {
      assertFileExistenceForPagePaths({
        pagePaths: expectedPages,
        type,
        shouldExist: true,
      })
    })

    describe(`shouldn't have unexpected html files`, () => {
      assertFileExistenceForPagePaths({
        pagePaths: unexpectedPages,
        type,
        shouldExist: false,
      })
    })

    it(`should recreate only some html files`, () => {
      expect(manifest[runNumber].generated.sort()).toEqual(
        expectedPagesToBeGenerated.sort()
      )
    })
  })

  describe(`page-data files`, () => {
    const type = `page-data`

    describe(`should have expected page-data files`, () => {
      assertFileExistenceForPagePaths({
        pagePaths: expectedPages,
        type,
        shouldExist: true,
      })
    })

    describe(`shouldn't have unexpected page-data files`, () => {
      assertFileExistenceForPagePaths({
        pagePaths: unexpectedPages,
        type,
        shouldExist: false,
      })
    })
  })

  // second run - only data changed and no bundle should have changed
  assertWebpackBundleChanges({ browser: false, ssr: false, runNumber })
})

describe(`Third run (js change, all pages are recreated)`, () => {
  const runNumber = 3

  const expectedPages = [
    `/stale-pages/only-not-in-first`,
    `/page-query-dynamic-3/`,
  ]

  const unexpectedPages = [
    `/stale-pages/only-in-first/`,
    `/page-query-dynamic-1/`,
    `/page-query-dynamic-2/`,
  ]

  let changedFileOriginalContent
  const changedFileAbspath = path.join(
    process.cwd(),
    `src`,
    `pages`,
    `gatsby-browser.js`
  )

  beforeAll(async () => {
    // make change to some .js
    changedFileOriginalContent = fs.readFileSync(changedFileAbspath, `utf-8`)
    filesToRevert[changedFileAbspath] = changedFileOriginalContent

    const newContent = changedFileOriginalContent.replace(/sad/g, `not happy`)

    if (newContent === changedFileOriginalContent) {
      throw new Error(`Test setup failed`)
    }

    fs.writeFileSync(changedFileAbspath, newContent)
    await runGatsbyWithRunTestSetup(runNumber)()
  })

  describe(`html files`, () => {
    const type = `html`

    describe(`should have expected html files`, () => {
      assertFileExistenceForPagePaths({
        pagePaths: expectedPages,
        type,
        shouldExist: true,
      })
    })

    describe(`shouldn't have unexpected html files`, () => {
      assertFileExistenceForPagePaths({
        pagePaths: unexpectedPages,
        type,
        shouldExist: false,
      })
    })

    it(`should recreate all html files`, () => {
      expect(manifest[runNumber].generated.sort()).toEqual(
        manifest[runNumber].allPages.sort()
      )
    })
  })

  describe(`page-data files`, () => {
    const type = `page-data`

    describe(`should have expected page-data files`, () => {
      assertFileExistenceForPagePaths({
        pagePaths: expectedPages,
        type,
        shouldExist: true,
      })
    })

    describe(`shouldn't have unexpected page-data files`, () => {
      assertFileExistenceForPagePaths({
        pagePaths: unexpectedPages,
        type,
        shouldExist: false,
      })
    })
  })

  // third run - we modify module used by both ssr and browser bundle - both bundles should change
  assertWebpackBundleChanges({ browser: true, ssr: true, runNumber })
})

describe(`Fourth run (gatsby-browser change - cache get invalidated)`, () => {
  const runNumber = 4

  const expectedPages = [
    `/stale-pages/only-not-in-first`,
    `/page-query-dynamic-4/`,
  ]

  const unexpectedPages = [
    `/stale-pages/only-in-first/`,
    `/page-query-dynamic-1/`,
    `/page-query-dynamic-2/`,
    `/page-query-dynamic-3/`,
  ]

  let changedFileOriginalContent
  const changedFileAbspath = path.join(process.cwd(), `gatsby-browser.js`)

  beforeAll(async () => {
    // make change to some .js
    changedFileOriginalContent = fs.readFileSync(changedFileAbspath, `utf-8`)
    filesToRevert[changedFileAbspath] = changedFileOriginalContent

    const newContent = changedFileOriginalContent.replace(/h1>/g, `h2>`)

    if (newContent === changedFileOriginalContent) {
      throw new Error(`Test setup failed`)
    }

    fs.writeFileSync(changedFileAbspath, newContent)
    await runGatsbyWithRunTestSetup(runNumber)()
  })

  describe(`html files`, () => {
    const type = `html`

    describe(`should have expected html files`, () => {
      assertFileExistenceForPagePaths({
        pagePaths: expectedPages,
        type,
        shouldExist: true,
      })
    })

    describe(`shouldn't have unexpected html files`, () => {
      assertFileExistenceForPagePaths({
        pagePaths: unexpectedPages,
        type,
        shouldExist: false,
      })
    })

    it(`should recreate all html files`, () => {
      expect(manifest[runNumber].generated.sort()).toEqual(
        manifest[runNumber].allPages.sort()
      )
    })
  })

  describe(`page-data files`, () => {
    const type = `page-data`

    describe(`should have expected page-data files`, () => {
      assertFileExistenceForPagePaths({
        pagePaths: expectedPages,
        type,
        shouldExist: true,
      })
    })

    describe(`shouldn't have unexpected page-data files`, () => {
      assertFileExistenceForPagePaths({
        pagePaths: unexpectedPages,
        type,
        shouldExist: false,
      })
    })
  })

  // Fourth run - we change gatsby-browser, so only browser bundle should change
  assertWebpackBundleChanges({ browser: true, ssr: false, runNumber })
})

describe(`Fifth run (ssr-only change - only ssr compilation hash changes)`, () => {
  const runNumber = 5

  const expectedPages = [
    `/stale-pages/only-not-in-first`,
    `/page-query-dynamic-5/`,
  ]

  const unexpectedPages = [
    `/stale-pages/only-in-first/`,
    `/page-query-dynamic-1/`,
    `/page-query-dynamic-2/`,
    `/page-query-dynamic-3/`,
    `/page-query-dynamic-4/`,
  ]

  let changedFileOriginalContent
  const changedFileAbspath = path.join(
    process.cwd(),
    `src`,
    `components`,
    `post-body-components-ssr.js`
  )

  beforeAll(async () => {
    // make change to some .js
    changedFileOriginalContent = fs.readFileSync(changedFileAbspath, `utf-8`)
    filesToRevert[changedFileAbspath] = changedFileOriginalContent

    const newContent = changedFileOriginalContent.replace(
      /SSR/g,
      `SSR (see I told you)`
    )

    if (newContent === changedFileOriginalContent) {
      throw new Error(`Test setup failed`)
    }

    fs.writeFileSync(changedFileAbspath, newContent)
    await runGatsbyWithRunTestSetup(runNumber)()
  })

  describe(`html files`, () => {
    const type = `html`

    describe(`should have expected html files`, () => {
      assertFileExistenceForPagePaths({
        pagePaths: expectedPages,
        type,
        shouldExist: true,
      })
    })

    describe(`shouldn't have unexpected html files`, () => {
      assertFileExistenceForPagePaths({
        pagePaths: unexpectedPages,
        type,
        shouldExist: false,
      })
    })

    it(`should recreate all html files`, () => {
      expect(manifest[runNumber].generated.sort()).toEqual(
        manifest[runNumber].allPages.sort()
      )
    })
  })

  describe(`page-data files`, () => {
    const type = `page-data`

    describe(`should have expected page-data files`, () => {
      assertFileExistenceForPagePaths({
        pagePaths: expectedPages,
        type,
        shouldExist: true,
      })
    })

    describe(`shouldn't have unexpected page-data files`, () => {
      assertFileExistenceForPagePaths({
        pagePaths: unexpectedPages,
        type,
        shouldExist: false,
      })
    })
  })

  // Fifth run - only ssr bundle should change as only file used by ssr was changed
  assertWebpackBundleChanges({ browser: false, ssr: true, runNumber })
})

describe(`Sixth run (.cache is deleted but public isn't)`, () => {
  const runNumber = 6

  const expectedPages = [
    `/stale-pages/only-not-in-first`,
    `/page-query-dynamic-6/`,
  ]

  const unexpectedPages = [
    `/stale-pages/only-in-first/`,
    `/page-query-dynamic-1/`,
    `/page-query-dynamic-2/`,
    `/page-query-dynamic-3/`,
    `/page-query-dynamic-4/`,
    `/page-query-dynamic-5/`,
  ]

  beforeAll(async () => {
    // delete .cache, but keep public
    fs.removeSync(path.join(process.cwd(), `.cache`))
    await runGatsbyWithRunTestSetup(runNumber)()
  })

  describe(`html files`, () => {
    const type = `html`

    describe(`should have expected html files`, () => {
      assertFileExistenceForPagePaths({
        pagePaths: expectedPages,
        type,
        shouldExist: true,
      })
    })

    describe(`shouldn't have unexpected html files`, () => {
      assertFileExistenceForPagePaths({
        pagePaths: unexpectedPages,
        type,
        shouldExist: false,
      })
    })

    it(`should recreate all html files`, () => {
      expect(manifest[runNumber].generated.sort()).toEqual(
        manifest[runNumber].allPages.sort()
      )
    })
  })

  describe(`page-data files`, () => {
    const type = `page-data`

    describe(`should have expected page-data files`, () => {
      assertFileExistenceForPagePaths({
        pagePaths: expectedPages,
        type,
        shouldExist: true,
      })
    })

    describe(`shouldn't have unexpected page-data files`, () => {
      assertFileExistenceForPagePaths({
        pagePaths: unexpectedPages,
        type,
        shouldExist: false,
      })
    })
  })

  // Sixth run - because cache was deleted before run - both browser and ssr bundle was "invalidated" (because there was nothing before)
  assertWebpackBundleChanges({ browser: true, ssr: true, runNumber })
})
