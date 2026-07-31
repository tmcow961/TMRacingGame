# Tuen Mun Road reference workflow

Open `tuen-mun-road-authoring.qgs` in QGIS. The project uses **Hong Kong 1980 Grid (EPSG:2326)** and loads the committed WGS84 route alignment with on-the-fly reprojection.

The realistic environment is generated from these official CSDI services:

- Digital Terrain Model, dataset `landsd_rcd_1638158088368_93806`, sampled from its WMS.
- Building, dataset `landsd_rcd_1637211194312_35158`, queried through its ArcGIS REST service.
- 3D Visualisation Map datasets `landsd_rcd_1742809441342_98380` and `landsd_rcd_1671676915450_88604`, used as structural and coastline references.

Run `npm run generate:environment` only when intentionally refreshing the derived route-corridor data. The command writes `src/data/tuen-mun-road.environment.json`; review its source date, grade validation, building clearance, and browser screenshots before accepting a refresh.

Do not commit CSDI source rasters/models, Open3Dhk screenshots, commercial map tiles, Street View captures, or paid MMS data.

Use `footage-index.csv` to connect owned footage and photographs to the route anchors. A passenger, dashcam, or safely stationary operator should record the footage; the driver must not operate the camera.

Run `npm run generate:track` only when intentionally refreshing the route from its documented sources. Review route changes in QGIS and in both game directions before accepting regenerated data.
