# Spacecraft models

Courtesy of NASA. These models are used for the informational visualization under the [NASA Images and Media Usage Guidelines](https://www.nasa.gov/nasa-brand-center/images-and-media/).

| Local model | NASA source | Credit |
| --- | --- | --- |
| `iss.glb` | [International Space Station (A)](https://science.nasa.gov/3d-resources/international-space-station-iss-a/) | NASA Ames Research Center |
| `aqua.glb` | [Aqua (B)](https://science.nasa.gov/3d-resources/aqua-b/) | NASA / Brian E. Kumanchik and Christian A. Lopez |
| `suomi-npp.glb` | [Suomi NPP](https://science.nasa.gov/3d-resources/suomi-national-polar-orbiting-partnership-suomi-npp/) | NASA / Brian E. Kumanchik and Christian A. Lopez |
| `aura.glb` | [Aura (A)](https://science.nasa.gov/3d-resources/aura-a/) | NASA Ames Research Center |
| `chandra.glb` | [Chandra X-ray Observatory](https://science.nasa.gov/3d-resources/chandra-x-ray-observatory/) | NASA / Brian E. Kumanchik |
| `fermi.glb` | [Fermi Gamma-ray Large Area Space Telescope](https://science.nasa.gov/3d-resources/fermi-gamma-ray-large-area-space-telescope/) | NASA / Christopher R. Meaney |
| `gpm.glb` | [Global Precipitation Measurement](https://science.nasa.gov/3d-resources/global-precipitation-measurement/) | NASA / Christopher R. Meaney |
| `hinode.glb` | [Hinode (Solar-B)](https://science.nasa.gov/3d-resources/hinode-solar-b/) | NASA / Christopher R. Meaney |
| `hubble.glb` | [Hubble Space Telescope (A)](https://science.nasa.gov/3d-resources/hubble-space-telescope-a/) | DigitalSpace Corporation, via NASA |
| `icesat-2.glb` | [Ice, Clouds, and Land Elevation Satellite-2 (ICESat-2) (B)](https://science.nasa.gov/3d-resources/ice-clouds-and-land-elevation-satellite-2-icesat-2-b/) | NASA / Brian E. Kumanchik |
| `landsat-8.glb` | [Landsat 8](https://science.nasa.gov/3d-resources/landsat-8/) | NASA / Christopher R. Meaney |
| `mms.glb` | [Magnetospheric Multiscale (MMS) (A)](https://science.nasa.gov/3d-resources/magnetospheric-multiscale-mms-a/) | NASA / Walter K. Feimer |
| `oco-2.glb` | [Orbiting Carbon Observatory (OCO) 2](https://science.nasa.gov/3d-resources/orbiting-carbon-observatory-oco-2/) | NASA / Christopher R. Meaney |
| `polar.glb` | [Polar](https://science.nasa.gov/3d-resources/polar/) | NASA / Christopher R. Meaney |
| `sdo.glb` | [Solar Dynamics Observatory](https://github.com/nasa/NASA-3D-Resources/tree/11ebb4ee043715aefbba6aeec8a61746fad67fa7/3D%20Models/Solar%20Dynamics%20Observatory) | NASA 3D Resources |
| `sentinel-6.glb` | [Jason Continuity of Service (Sentinel-6)](https://science.nasa.gov/3d-resources/jason-continuity-of-service-sentinel-6/) | NASA / Matthew J. Garcia |
| `sorce.glb` | [Solar Radiation and Climate Experiment (SORCE)](https://github.com/nasa/NASA-3D-Resources/tree/11ebb4ee043715aefbba6aeec8a61746fad67fa7/3D%20Models/Solar%20Radiation%20and%20Climate%20Experiment%20%28SORCE%29) | NASA 3D Resources |
| `swas.glb` | [Submillimeter Wave Astronomy Satellite (SWAS)](https://science.nasa.gov/3d-resources/submillimeter-wave-astronomy-satellite-swas/) | NASA / Christopher R. Meaney |
| `tess.glb` | [Transiting Exoplanet Survey Satellite (TESS) (B)](https://science.nasa.gov/3d-resources/transiting-exoplanet-survey-satellite-tess-b/) | NASA / Matthew J. Garcia |
| `themis.glb` | [Time History of Events and Macroscale Interactions During Substorms (THEMIS)](https://science.nasa.gov/3d-resources/time-history-of-events-and-macroscale-interactions-during-substorms-themis/) | NASA / JPL Eyes on the Solar System |

Sozai Search MCP v0.2.2 retrieved the source GLBs from [NASA 3D Resources](https://github.com/nasa/NASA-3D-Resources/tree/11ebb4ee043715aefbba6aeec8a61746fad67fa7). glTF Transform aligned and centered the models, normalized them to a unit span, and quantized their geometry. Textures are limited to 256 pixels per side. Meshoptimizer simplified denser meshes, and several untextured meshes use flat shading.

The Hubble model is used under [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/), as listed for the same DigitalSpace Corporation mesh on [NASA's Sketchfab release](https://sketchfab.com/3d-models/hubble-space-telescope-640764e1a20a4c7ea9718a83a05bcb7f). The atlas version resizes the textures and changes the scale and geometry precision.

For close views, the ISS and Aqua use the published [ISS wingspan](https://www.nasa.gov/reference/international-space-station/) and [Aqua deployed span](https://aqua.nasa.gov/content/about-aqua). Suomi NPP uses an approximate 9 m span based on its model proportions and [8 m solar array](https://ntrs.nasa.gov/citations/20180002828). Models without a calibrated span use screen size. Model orientation is illustrative. Live Beta displays spacecraft with usable CelesTrak elements.

The longest antenna booms determine the close-view spans for [MMS](https://mms.gsfc.nasa.gov/documents/education/math_guide/mms_math_guide.pdf), [Polar](https://ntrs.nasa.gov/api/citations/19970017186/downloads/19970017186.pdf), and [THEMIS](https://themis.ssl.berkeley.edu/efi_table.shtml).
