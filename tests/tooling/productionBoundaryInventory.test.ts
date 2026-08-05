import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const sourceRoot = path.resolve(__dirname, '../../src')

const rawEnvironmentRead = /\bprocess\.env(?:\.|\[)/
const localFiveHundred = /\.status\(\s*500\s*\)/
const publicErrorDetail = /\.json\([^\n]*(?:error\.message|details\s*:)/

type Inventory = {
  rawEnvironmentRead: string[]
  localHttp500: string[]
  publicErrorDetail: string[]
}

function sourceFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(directory, entry.name)
    if (entry.isDirectory()) return sourceFiles(absolutePath)
    return entry.isFile() && entry.name.endsWith('.ts') ? [absolutePath] : []
  })
}

function inventory(root = sourceRoot): Inventory {
  const result: Inventory = {
    rawEnvironmentRead: [],
    localHttp500: [],
    publicErrorDetail: [],
  }

  for (const filePath of sourceFiles(root)) {
    const relativePath = path.relative(root, filePath).split(path.sep).join('/')
    const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/)
    lines.forEach((line, index) => {
      const location = `src/${relativePath}:${index + 1}`
      if (rawEnvironmentRead.test(line)) result.rawEnvironmentRead.push(location)
      if (localFiveHundred.test(line)) result.localHttp500.push(location)
      if (publicErrorDetail.test(line)) result.publicErrorDetail.push(location)
    })
  }

  for (const values of Object.values(result)) values.sort()
  return result
}

const BASELINE = {
  "rawEnvironmentRead": [
    "src/controllers/clarezaController.ts:106",
    "src/controllers/clarezaController.ts:193",
    "src/controllers/clarezaController.ts:251",
    "src/controllers/clarezaController.ts:269",
    "src/controllers/clarezaController.ts:29",
    "src/controllers/classes.controller.ts:1454",
    "src/controllers/classes.controller.ts:158",
    "src/controllers/classes.controller.ts:159",
    "src/controllers/classes.controller.ts:1754",
    "src/controllers/classes.controller.ts:2062",
    "src/controllers/classes.controller.ts:367",
    "src/controllers/classes.controller.ts:561",
    "src/controllers/guru.sso.controller.ts:14",
    "src/controllers/guru.webhook.controller.ts:15",
    "src/controllers/syncUtilizadoresControllers/curseduca.controller.ts:197",
    "src/controllers/syncUtilizadoresControllers/curseduca.controller.ts:204",
    "src/controllers/syncUtilizadoresControllers/curseduca.controller.ts:205",
    "src/controllers/syncUtilizadoresControllers/curseduca.controller.ts:206",
    "src/controllers/syncUtilizadoresControllers/curseduca.controller.ts:416",
    "src/controllers/syncUtilizadoresControllers/hotmart.controller.ts:1109",
    "src/controllers/syncUtilizadoresControllers/hotmart.controller.ts:286",
    "src/controllers/syncUtilizadoresControllers/hotmart.controller.ts:287",
    "src/controllers/syncUtilizadoresControllers/hotmart.controller.ts:326",
    "src/controllers/syncUtilizadoresControllers/hotmart.controller.ts:451",
    "src/services/clareza/clarezaCarteiraService.ts:4511",
    "src/services/clareza/clarezaCarteiraService.ts:4658",
    "src/services/clareza/clarezaFmpService.ts:1055",
    "src/services/clareza/clarezaFmpService.ts:1071",
    "src/services/clareza/clarezaFmpService.ts:360",
    "src/services/clareza/clarezaFmpService.ts:457",
    "src/services/clareza/clarezaFmpService.ts:545",
    "src/services/clareza/clarezaFmpService.ts:702",
    "src/services/clareza/clarezaFmpService.ts:731",
    "src/services/clareza/clarezaFmpService.ts:818",
    "src/services/clareza/clarezaFmpService.ts:832",
    "src/services/clareza/clarezaRaioxService.ts:121",
    "src/services/clareza/clarezaRaioxService.ts:126",
    "src/services/clareza/clarezaRaioxService.ts:356",
    "src/services/clareza/clarezaRaioxService.ts:455",
    "src/services/clareza/clarezaRaioxService.ts:577",
    "src/services/courseLessonCatalog.service.ts:124",
    "src/services/courseLessonCatalog.service.ts:126",
    "src/services/courseLessonCatalog.service.ts:127",
    "src/services/courseLessonCatalog.service.ts:135",
    "src/services/courseLessonCatalog.service.ts:136",
    "src/services/guru/guru.constants.ts:11",
    "src/services/guru/guru.constants.ts:12",
    "src/services/guru/guru.constants.ts:13",
    "src/services/guru/guruSync.service.ts:20",
    "src/services/notification.service.ts:14",
    "src/services/renewal/discordRolesSync.service.ts:34",
    "src/services/renewal/discordRolesSync.service.ts:35",
    "src/services/renewal/discordRolesSync.service.ts:36",
    "src/services/renewal/discordRolesSync.service.ts:38",
    "src/services/renewal/discordRolesSync.service.ts:39",
    "src/services/renewal/discordRolesSync.service.ts:42",
    "src/services/renewal/discordRolesSync.service.ts:69",
    "src/services/renewal/discordRolesSync.service.ts:75",
    "src/services/renewal/discordScheduledMessages.service.ts:35",
    "src/services/renewal/hotmartRefunds.service.ts:123",
    "src/services/renewal/renewalAcSync.service.ts:38",
    "src/services/renewal/renewalAcSync.service.ts:39",
    "src/services/renewal/renewalAcSync.service.ts:40",
    "src/services/renewal/renewalAcSync.service.ts:41",
    "src/services/renewal/renewalAcSync.service.ts:42",
    "src/services/renewal/renewalAcSync.service.ts:44",
    "src/services/renewal/renewalAcSync.service.ts:45",
    "src/services/renewal/renewalSync.service.ts:167",
    "src/services/studentOgiSummary.service.ts:191",
    "src/services/syncUtilizadoresServices/curseducaServices/curseduca.adapter.ts:35",
    "src/services/syncUtilizadoresServices/curseducaServices/curseduca.adapter.ts:36",
    "src/services/syncUtilizadoresServices/hotmartServices/hotmart.helpers.ts:126",
    "src/services/syncUtilizadoresServices/hotmartServices/hotmart.helpers.ts:127",
    "src/services/syncUtilizadoresServices/hotmartServices/hotmart.helpers.ts:176",
    "src/services/syncUtilizadoresServices/hotmartServices/hotmart.helpers.ts:242",
    "src/services/syncUtilizadoresServices/hotmartServices/hotmartLessonsService.ts:12",
    "src/services/syncUtilizadoresServices/hotmartServices/hotmartLessonsService.ts:13"
  ],
  "localHttp500": [
    "src/controllers/acTags/acReader.controller.ts:150",
    "src/controllers/acTags/acReader.controller.ts:188",
    "src/controllers/acTags/acReader.controller.ts:249",
    "src/controllers/acTags/acReader.controller.ts:293",
    "src/controllers/acTags/acReader.controller.ts:328",
    "src/controllers/acTags/activecampaign.controller.ts:1097",
    "src/controllers/acTags/activecampaign.controller.ts:1173",
    "src/controllers/acTags/activecampaign.controller.ts:1227",
    "src/controllers/acTags/activecampaign.controller.ts:1271",
    "src/controllers/acTags/activecampaign.controller.ts:1316",
    "src/controllers/acTags/activecampaign.controller.ts:1376",
    "src/controllers/acTags/activecampaign.controller.ts:257",
    "src/controllers/acTags/activecampaign.controller.ts:275",
    "src/controllers/acTags/activecampaign.controller.ts:313",
    "src/controllers/acTags/activecampaign.controller.ts:441",
    "src/controllers/acTags/activecampaign.controller.ts:459",
    "src/controllers/acTags/activecampaign.controller.ts:586",
    "src/controllers/acTags/activecampaign.controller.ts:604",
    "src/controllers/acTags/activecampaign.controller.ts:687",
    "src/controllers/acTags/activecampaign.controller.ts:710",
    "src/controllers/acTags/activecampaign.controller.ts:739",
    "src/controllers/acTags/activecampaign.controller.ts:768",
    "src/controllers/acTags/activecampaign.controller.ts:909",
    "src/controllers/acTags/tagRule.controller.ts:104",
    "src/controllers/acTags/tagRule.controller.ts:143",
    "src/controllers/acTags/tagRule.controller.ts:178",
    "src/controllers/acTags/tagRule.controller.ts:215",
    "src/controllers/acTags/tagRule.controller.ts:34",
    "src/controllers/acTags/tagRule.controller.ts:67",
    "src/controllers/acTags/tagRuleEstimate.controller.ts:123",
    "src/controllers/acTags/tagRuleEstimate.controller.ts:210",
    "src/controllers/acTags/tagRuleEstimate.controller.ts:302",
    "src/controllers/auth.controller.ts:107",
    "src/controllers/auth.controller.ts:154",
    "src/controllers/auth.controller.ts:207",
    "src/controllers/auth.controller.ts:270",
    "src/controllers/businessAnalytics.controller.ts:262",
    "src/controllers/businessAnalytics.controller.ts:361",
    "src/controllers/businessAnalytics.controller.ts:404",
    "src/controllers/businessAnalytics.controller.ts:429",
    "src/controllers/clarezaController.ts:119",
    "src/controllers/clarezaController.ts:175",
    "src/controllers/clarezaController.ts:187",
    "src/controllers/clarezaController.ts:206",
    "src/controllers/clarezaController.ts:220",
    "src/controllers/clarezaController.ts:23",
    "src/controllers/clarezaController.ts:231",
    "src/controllers/clarezaController.ts:245",
    "src/controllers/clarezaController.ts:264",
    "src/controllers/clarezaController.ts:282",
    "src/controllers/clarezaController.ts:42",
    "src/controllers/clarezaController.ts:60",
    "src/controllers/classes.controller.ts:1165",
    "src/controllers/classes.controller.ts:1231",
    "src/controllers/classes.controller.ts:1277",
    "src/controllers/classes.controller.ts:1326",
    "src/controllers/classes.controller.ts:1527",
    "src/controllers/classes.controller.ts:1589",
    "src/controllers/classes.controller.ts:1673",
    "src/controllers/classes.controller.ts:1851",
    "src/controllers/classes.controller.ts:1984",
    "src/controllers/classes.controller.ts:2050",
    "src/controllers/classes.controller.ts:222",
    "src/controllers/classes.controller.ts:2375",
    "src/controllers/classes.controller.ts:2443",
    "src/controllers/classes.controller.ts:268",
    "src/controllers/classes.controller.ts:317",
    "src/controllers/classes.controller.ts:549",
    "src/controllers/classes.controller.ts:720",
    "src/controllers/classes.controller.ts:756",
    "src/controllers/classes.controller.ts:796",
    "src/controllers/classes.controller.ts:834",
    "src/controllers/classes.controller.ts:872",
    "src/controllers/classes.controller.ts:910",
    "src/controllers/classes.controller.ts:946",
    "src/controllers/classes.controller.ts:980",
    "src/controllers/cohortAnalytics.controller.ts:54",
    "src/controllers/course.controller.ts:135",
    "src/controllers/course.controller.ts:178",
    "src/controllers/course.controller.ts:25",
    "src/controllers/course.controller.ts:64",
    "src/controllers/course.controller.ts:98",
    "src/controllers/courseLessons.controller.ts:42",
    "src/controllers/courseLessons.controller.ts:75",
    "src/controllers/courseLessons.controller.ts:90",
    "src/controllers/dashboard.controller.ts:108",
    "src/controllers/dashboard.controller.ts:199",
    "src/controllers/dashboard.controller.ts:261",
    "src/controllers/dashboard.controller.ts:349",
    "src/controllers/dashboard.controller.ts:374",
    "src/controllers/dashboard.controller.ts:401",
    "src/controllers/dashboard.controller.ts:494",
    "src/controllers/dashboardQuick.controller.ts:143",
    "src/controllers/dashboardQuick.controller.ts:217",
    "src/controllers/dashboardQuick.controller.ts:310",
    "src/controllers/discovery.controller.ts:163",
    "src/controllers/discovery.controller.ts:49",
    "src/controllers/discovery.controller.ts:83",
    "src/controllers/engagement.controller.ts:294",
    "src/controllers/engagement.controller.ts:550",
    "src/controllers/engagement.controller.ts:573",
    "src/controllers/engagement.controller.ts:766",
    "src/controllers/engagement.controller.ts:960",
    "src/controllers/guru.analytics.controller.ts:185",
    "src/controllers/guru.analytics.controller.ts:343",
    "src/controllers/guru.analytics.controller.ts:381",
    "src/controllers/guru.analytics.controller.ts:804",
    "src/controllers/guru.analytics.controller.ts:991",
    "src/controllers/guru.inactivation.controller.ts:1100",
    "src/controllers/guru.inactivation.controller.ts:1179",
    "src/controllers/guru.inactivation.controller.ts:1251",
    "src/controllers/guru.inactivation.controller.ts:1298",
    "src/controllers/guru.inactivation.controller.ts:1399",
    "src/controllers/guru.inactivation.controller.ts:1471",
    "src/controllers/guru.inactivation.controller.ts:1579",
    "src/controllers/guru.inactivation.controller.ts:203",
    "src/controllers/guru.inactivation.controller.ts:304",
    "src/controllers/guru.inactivation.controller.ts:314",
    "src/controllers/guru.inactivation.controller.ts:489",
    "src/controllers/guru.inactivation.controller.ts:543",
    "src/controllers/guru.inactivation.controller.ts:600",
    "src/controllers/guru.inactivation.controller.ts:668",
    "src/controllers/guru.inactivation.controller.ts:735",
    "src/controllers/guru.inactivation.controller.ts:907",
    "src/controllers/guru.snapshot.controller.ts:252",
    "src/controllers/guru.snapshot.controller.ts:331",
    "src/controllers/guru.snapshot.controller.ts:361",
    "src/controllers/guru.snapshot.controller.ts:400",
    "src/controllers/guru.snapshot.controller.ts:439",
    "src/controllers/guru.snapshot.controller.ts:509",
    "src/controllers/guru.snapshot.controller.ts:665",
    "src/controllers/guru.snapshot.controller.ts:902",
    "src/controllers/guru.sso.controller.ts:120",
    "src/controllers/guru.sso.controller.ts:149",
    "src/controllers/guru.sso.controller.ts:162",
    "src/controllers/guru.sso.controller.ts:229",
    "src/controllers/guru.sso.controller.ts:309",
    "src/controllers/guru.sso.controller.ts:90",
    "src/controllers/guru.sync.controller.ts:126",
    "src/controllers/guru.sync.controller.ts:186",
    "src/controllers/guru.sync.controller.ts:237",
    "src/controllers/guru.sync.controller.ts:313",
    "src/controllers/guru.sync.controller.ts:65",
    "src/controllers/guru.trials.controller.ts:137",
    "src/controllers/guru.trials.controller.ts:37",
    "src/controllers/guru.trials.controller.ts:51",
    "src/controllers/guru.trials.controller.ts:70",
    "src/controllers/guru.trials.controller.ts:89",
    "src/controllers/guru.webhook.controller.ts:290",
    "src/controllers/guru.webhook.controller.ts:367",
    "src/controllers/guru.webhook.controller.ts:448",
    "src/controllers/guru.webhook.controller.ts:497",
    "src/controllers/guru.webhook.controller.ts:559",
    "src/controllers/guru.webhook.controller.ts:82",
    "src/controllers/guruSubscriptionList.controller.ts:126",
    "src/controllers/guruWebhookList.controller.ts:75",
    "src/controllers/health.controller.ts:56",
    "src/controllers/lessons.controller.ts:147",
    "src/controllers/lessons.controller.ts:200",
    "src/controllers/lessons.controller.ts:237",
    "src/controllers/lessons.controller.ts:49",
    "src/controllers/lessons.controller.ts:95",
    "src/controllers/metrics.controller.ts:26",
    "src/controllers/metrics.controller.ts:47",
    "src/controllers/metrics.controller.ts:83",
    "src/controllers/populateHistory.controller.ts:257",
    "src/controllers/populateHistory.controller.ts:310",
    "src/controllers/populateHistory.controller.ts:367",
    "src/controllers/products/product.controller.ts:119",
    "src/controllers/products/product.controller.ts:205",
    "src/controllers/products/product.controller.ts:249",
    "src/controllers/products/product.controller.ts:307",
    "src/controllers/products/product.controller.ts:354",
    "src/controllers/products/product.controller.ts:465",
    "src/controllers/products/product.controller.ts:71",
    "src/controllers/products/productProfile.controller.ts:138",
    "src/controllers/products/productProfile.controller.ts:187",
    "src/controllers/products/productProfile.controller.ts:253",
    "src/controllers/products/productProfile.controller.ts:39",
    "src/controllers/products/productProfile.controller.ts:391",
    "src/controllers/products/productProfile.controller.ts:464",
    "src/controllers/products/productProfile.controller.ts:76",
    "src/controllers/products/productSalesStats.controller.ts:106",
    "src/controllers/products/productSalesStats.controller.ts:139",
    "src/controllers/products/productSalesStats.controller.ts:183",
    "src/controllers/products/productSalesStats.controller.ts:28",
    "src/controllers/products/productSalesStats.controller.ts:58",
    "src/controllers/products/products.controller.ts:116",
    "src/controllers/products/products.controller.ts:150",
    "src/controllers/products/products.controller.ts:169",
    "src/controllers/products/products.controller.ts:17",
    "src/controllers/renewal.controller.ts:123",
    "src/controllers/renewal.controller.ts:137",
    "src/controllers/renewal.controller.ts:150",
    "src/controllers/renewal.controller.ts:161",
    "src/controllers/renewal.controller.ts:26",
    "src/controllers/renewal.controller.ts:81",
    "src/controllers/studentHistory.controller.ts:113",
    "src/controllers/studentHistory.controller.ts:194",
    "src/controllers/studentsController.ts:60",
    "src/controllers/studentsController.ts:68",
    "src/controllers/sync.controller.ts:121",
    "src/controllers/sync.controller.ts:176",
    "src/controllers/sync.controller.ts:242",
    "src/controllers/sync.controller.ts:294",
    "src/controllers/sync.controller.ts:438",
    "src/controllers/sync.controller.ts:49",
    "src/controllers/sync.controller.ts:542",
    "src/controllers/sync.controller.ts:576",
    "src/controllers/sync.controller.ts:59",
    "src/controllers/sync.controller.ts:624",
    "src/controllers/sync.controller.ts:660",
    "src/controllers/sync.controller.ts:711",
    "src/controllers/syncUtilizadoresControllers/cronManagement.controller.ts:146",
    "src/controllers/syncUtilizadoresControllers/cronManagement.controller.ts:204",
    "src/controllers/syncUtilizadoresControllers/cronManagement.controller.ts:426",
    "src/controllers/syncUtilizadoresControllers/cronManagement.controller.ts:496",
    "src/controllers/syncUtilizadoresControllers/cronManagement.controller.ts:535",
    "src/controllers/syncUtilizadoresControllers/cronManagement.controller.ts:585",
    "src/controllers/syncUtilizadoresControllers/cronManagement.controller.ts:637",
    "src/controllers/syncUtilizadoresControllers/cronManagement.controller.ts:726",
    "src/controllers/syncUtilizadoresControllers/cronManagement.controller.ts:784",
    "src/controllers/syncUtilizadoresControllers/cronManagement.controller.ts:832",
    "src/controllers/syncUtilizadoresControllers/cronManagement.controller.ts:898",
    "src/controllers/syncUtilizadoresControllers/curseduca.controller.ts:133",
    "src/controllers/syncUtilizadoresControllers/curseduca.controller.ts:411",
    "src/controllers/syncUtilizadoresControllers/curseduca.controller.ts:553",
    "src/controllers/syncUtilizadoresControllers/curseduca.controller.ts:589",
    "src/controllers/syncUtilizadoresControllers/curseduca.controller.ts:639",
    "src/controllers/syncUtilizadoresControllers/curseduca.controller.ts:689",
    "src/controllers/syncUtilizadoresControllers/curseduca.controller.ts:718",
    "src/controllers/syncUtilizadoresControllers/curseduca.controller.ts:744",
    "src/controllers/syncUtilizadoresControllers/curseduca.controller.ts:804",
    "src/controllers/syncUtilizadoresControllers/hotmart.controller.ts:1006",
    "src/controllers/syncUtilizadoresControllers/hotmart.controller.ts:1105",
    "src/controllers/syncUtilizadoresControllers/hotmart.controller.ts:1182",
    "src/controllers/syncUtilizadoresControllers/hotmart.controller.ts:1235",
    "src/controllers/syncUtilizadoresControllers/hotmart.controller.ts:133",
    "src/controllers/syncUtilizadoresControllers/hotmart.controller.ts:173",
    "src/controllers/syncUtilizadoresControllers/hotmart.controller.ts:228",
    "src/controllers/syncUtilizadoresControllers/hotmart.controller.ts:270",
    "src/controllers/syncUtilizadoresControllers/hotmart.controller.ts:819",
    "src/controllers/syncUtilizadoresControllers/hotmart.controller.ts:948",
    "src/controllers/syncUtilizadoresControllers/hotmart.controller.ts:981",
    "src/controllers/syncUtilizadoresControllers/syncReports.controller.ts:108",
    "src/controllers/syncUtilizadoresControllers/syncReports.controller.ts:40",
    "src/controllers/syncUtilizadoresControllers/syncReports.controller.ts:77",
    "src/controllers/syncUtilizadoresControllers/syncStats.controller.ts:154",
    "src/controllers/syncUtilizadoresControllers/syncStats.controller.ts:202",
    "src/controllers/syncUtilizadoresControllers/syncStats.controller.ts:268",
    "src/controllers/syncUtilizadoresControllers/syncStats.controller.ts:336",
    "src/controllers/syncUtilizadoresControllers/syncStats.controller.ts:385",
    "src/controllers/syncUtilizadoresControllers/syncStats.controller.ts:431",
    "src/controllers/syncUtilizadoresControllers/syncStats.controller.ts:463",
    "src/controllers/syncUtilizadoresControllers/syncStats.controller.ts:501",
    "src/controllers/syncUtilizadoresControllers/syncStats.controller.ts:72",
    "src/controllers/tagEvaluation.controller.ts:411",
    "src/controllers/tagEvaluation.controller.ts:560",
    "src/controllers/tagMonitoring/criticalTag.controller.ts:127",
    "src/controllers/tagMonitoring/criticalTag.controller.ts:169",
    "src/controllers/tagMonitoring/criticalTag.controller.ts:209",
    "src/controllers/tagMonitoring/criticalTag.controller.ts:258",
    "src/controllers/tagMonitoring/criticalTag.controller.ts:26",
    "src/controllers/tagMonitoring/criticalTag.controller.ts:285",
    "src/controllers/tagMonitoring/criticalTag.controller.ts:307",
    "src/controllers/tagMonitoring/criticalTag.controller.ts:88",
    "src/controllers/tagMonitoring/tagMonitoring.controller.ts:136",
    "src/controllers/tagMonitoring/tagMonitoring.controller.ts:161",
    "src/controllers/tagMonitoring/tagMonitoring.controller.ts:183",
    "src/controllers/tagMonitoring/tagMonitoring.controller.ts:226",
    "src/controllers/tagMonitoring/tagMonitoring.controller.ts:251",
    "src/controllers/tagMonitoring/tagMonitoring.controller.ts:288",
    "src/controllers/tagMonitoring/tagMonitoring.controller.ts:316",
    "src/controllers/tagMonitoring/tagMonitoring.controller.ts:34",
    "src/controllers/tagMonitoring/tagMonitoring.controller.ts:357",
    "src/controllers/tagMonitoring/tagMonitoring.controller.ts:71",
    "src/controllers/tagMonitoring/tagNotification.controller.ts:113",
    "src/controllers/tagMonitoring/tagNotification.controller.ts:156",
    "src/controllers/tagMonitoring/tagNotification.controller.ts:199",
    "src/controllers/tagMonitoring/tagNotification.controller.ts:241",
    "src/controllers/tagMonitoring/tagNotification.controller.ts:263",
    "src/controllers/tagMonitoring/tagNotification.controller.ts:286",
    "src/controllers/tagMonitoring/tagNotification.controller.ts:308",
    "src/controllers/tagMonitoring/tagNotification.controller.ts:37",
    "src/controllers/tagMonitoring/tagNotification.controller.ts:78",
    "src/controllers/testHistory.controller.ts:172",
    "src/controllers/testHistory.controller.ts:242",
    "src/controllers/testimonials.controller.ts:1017",
    "src/controllers/testimonials.controller.ts:1126",
    "src/controllers/testimonials.controller.ts:1210",
    "src/controllers/testimonials.controller.ts:361",
    "src/controllers/testimonials.controller.ts:456",
    "src/controllers/testimonials.controller.ts:544",
    "src/controllers/testimonials.controller.ts:659",
    "src/controllers/testimonials.controller.ts:738",
    "src/controllers/testimonials.controller.ts:770",
    "src/controllers/testimonials.controller.ts:939",
    "src/controllers/userHistory.controller.ts:166",
    "src/controllers/userHistory.controller.ts:209",
    "src/controllers/userHistory.controller.ts:85",
    "src/controllers/users.controller.ts:1098",
    "src/controllers/users.controller.ts:1156",
    "src/controllers/users.controller.ts:1287",
    "src/controllers/users.controller.ts:1315",
    "src/controllers/users.controller.ts:1357",
    "src/controllers/users.controller.ts:1697",
    "src/controllers/users.controller.ts:1779",
    "src/controllers/users.controller.ts:1850",
    "src/controllers/users.controller.ts:1941",
    "src/controllers/users.controller.ts:2204",
    "src/controllers/users.controller.ts:304",
    "src/controllers/users.controller.ts:417",
    "src/controllers/users.controller.ts:812",
    "src/controllers/usersReviewLists.controller.ts:38",
    "src/controllers/usersReviewLists.controller.ts:66",
    "src/controllers/webhooks.controller.ts:31",
    "src/controllers/webhooks.controller.ts:52",
    "src/middleware/auth.middleware.ts:76",
    "src/routes/ACroutes/activecampaign.routes.ts:205",
    "src/routes/achievements.routes.ts:118",
    "src/routes/achievements.routes.ts:164",
    "src/routes/achievements.routes.ts:47",
    "src/routes/achievements.routes.ts:71",
    "src/routes/dashboardRoutes.ts:82",
    "src/routes/events.routes.ts:120",
    "src/routes/events.routes.ts:137",
    "src/routes/events.routes.ts:150",
    "src/routes/events.routes.ts:163",
    "src/routes/events.routes.ts:186",
    "src/routes/events.routes.ts:199",
    "src/routes/events.routes.ts:209",
    "src/routes/events.routes.ts:221",
    "src/routes/events.routes.ts:348",
    "src/routes/events.routes.ts:36",
    "src/routes/events.routes.ts:54",
    "src/routes/events.routes.ts:91",
    "src/routes/users.routes.ts:254",
    "src/routes/validationLogs.routes.ts:137",
    "src/routes/validationLogs.routes.ts:70"
  ],
  "publicErrorDetail": [
    "src/controllers/guru.trials.controller.ts:113",
    "src/controllers/guru.trials.controller.ts:137",
    "src/controllers/guru.trials.controller.ts:37",
    "src/controllers/guru.trials.controller.ts:51",
    "src/controllers/guru.trials.controller.ts:70",
    "src/controllers/guru.trials.controller.ts:89",
    "src/controllers/renewal.controller.ts:123",
    "src/controllers/renewal.controller.ts:137",
    "src/controllers/renewal.controller.ts:150",
    "src/controllers/renewal.controller.ts:161",
    "src/controllers/renewal.controller.ts:26",
    "src/controllers/renewal.controller.ts:81",
    "src/controllers/sync.controller.ts:711",
    "src/controllers/users.controller.ts:1156",
    "src/controllers/users.controller.ts:1357",
    "src/controllers/webhooks.controller.ts:31",
    "src/controllers/webhooks.controller.ts:52",
    "src/routes/achievements.routes.ts:118",
    "src/routes/achievements.routes.ts:164",
    "src/routes/achievements.routes.ts:47",
    "src/routes/achievements.routes.ts:71",
    "src/routes/events.routes.ts:120",
    "src/routes/events.routes.ts:137",
    "src/routes/events.routes.ts:150",
    "src/routes/events.routes.ts:163",
    "src/routes/events.routes.ts:186",
    "src/routes/events.routes.ts:199",
    "src/routes/events.routes.ts:209",
    "src/routes/events.routes.ts:221",
    "src/routes/events.routes.ts:348",
    "src/routes/events.routes.ts:36",
    "src/routes/events.routes.ts:54",
    "src/routes/events.routes.ts:91"
  ]
} as const

/**
 * Reviewable debt totals. The path lists above move whenever an unrelated edit
 * shifts a line number, which makes a growing debt easy to miss in a large
 * diff. These ceilings must only ever be lowered: a slice that resolves debt
 * lowers the number, a slice that merely relocates it cannot hide behind the
 * churn, and a slice that adds debt fails here even if the baseline was
 * regenerated.
 */
const DEBT_CEILING = {
  "rawEnvironmentRead": 77,
  "localHttp500": 339,
  "publicErrorDetail": 33
} as const

test('production boundary inventory matches the migration baseline', () => {
  const current = inventory()

  expect(current.rawEnvironmentRead).toEqual(BASELINE.rawEnvironmentRead)
  expect(current.localHttp500).toEqual(BASELINE.localHttp500)
  expect(current.publicErrorDetail).toEqual(BASELINE.publicErrorDetail)
})

test('production boundary debt never grows', () => {
  const current = inventory()

  expect(current.rawEnvironmentRead.length).toBeLessThanOrEqual(DEBT_CEILING.rawEnvironmentRead)
  expect(current.localHttp500.length).toBeLessThanOrEqual(DEBT_CEILING.localHttp500)
  expect(current.publicErrorDetail.length).toBeLessThanOrEqual(DEBT_CEILING.publicErrorDetail)

  // The ceiling is only meaningful while it tracks the recorded baseline.
  expect(BASELINE.rawEnvironmentRead.length).toBeLessThanOrEqual(DEBT_CEILING.rawEnvironmentRead)
  expect(BASELINE.localHttp500.length).toBeLessThanOrEqual(DEBT_CEILING.localHttp500)
  expect(BASELINE.publicErrorDetail.length).toBeLessThanOrEqual(DEBT_CEILING.publicErrorDetail)
})

test('inventory catches owned consumer mutations and restores every fixture', () => {
  const sourceOwnedPath = path.join(sourceRoot, 'security/validatedInput.ts')
  const originalOwnedConsumer = fs.readFileSync(sourceOwnedPath, 'utf8')
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bo2-inventory-'))
  const ownedConsumerPath = path.join(tempRoot, 'security/validatedInput.ts')
  const fixturePath = path.join(tempRoot, '__task1_inventory_fixture.ts')
  const ownedMutation = `const __task3_inventory_mutation = process.env.NODE_ENV\n`
  const fixture = `const unsafe = process.env.UNSAFE_TEST\nconst fiveHundred = res.status(500)\nconst detail = res.json({ details: error.message })\n`

  try {
    fs.mkdirSync(path.dirname(ownedConsumerPath), { recursive: true })
    fs.writeFileSync(ownedConsumerPath, `${ownedMutation}${originalOwnedConsumer}`, 'utf8')
    fs.writeFileSync(fixturePath, fixture, 'utf8')
    const mutated = inventory(tempRoot)
    expect(mutated.rawEnvironmentRead).toContain('src/security/validatedInput.ts:1')
    expect(mutated.rawEnvironmentRead).toContain('src/__task1_inventory_fixture.ts:1')
    expect(mutated.localHttp500).toContain('src/__task1_inventory_fixture.ts:2')
    expect(mutated.publicErrorDetail).toContain('src/__task1_inventory_fixture.ts:3')
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true })
  }

  const restored = inventory()
  expect(restored.rawEnvironmentRead).toEqual(BASELINE.rawEnvironmentRead)
  expect(restored.localHttp500).toEqual(BASELINE.localHttp500)
  expect(restored.publicErrorDetail).toEqual(BASELINE.publicErrorDetail)
  expect(fs.existsSync(tempRoot)).toBe(false)
})
