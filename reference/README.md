# Tuen Mun Road reference workflow

The committed source alignment is WGS84 GeoJSON and can be opened directly in QGIS. For a master authoring project, set the QGIS project CRS to **Hong Kong 1980 Grid (EPSG:2326)**, reproject the source layer, and save the project beside this file. Do not commit copyrighted map tiles or Street View captures.

Use `footage-index.csv` to connect owned footage and photographs to the route anchors. A passenger, dashcam, or safely stationary operator should record the footage; the driver must not operate the camera.

Run `npm run generate:track` only when intentionally refreshing the route from its documented sources. Review route changes in QGIS and in both game directions before accepting regenerated data.
