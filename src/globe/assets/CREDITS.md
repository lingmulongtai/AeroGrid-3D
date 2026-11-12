# Spacecraft models

Courtesy of NASA. These models are used for the informational visualization under the [NASA Images and Media Usage Guidelines](https://www.nasa.gov/nasa-brand-center/images-and-media/).

| Local model | NASA source | Credit |
| --- | --- | --- |
| `iss.glb` | [International Space Station (A)](https://science.nasa.gov/3d-resources/international-space-station-iss-a/) | NASA Ames Research Center |
| `aqua.glb` | [Aqua (B)](https://science.nasa.gov/3d-resources/aqua-b/) | NASA / Brian E. Kumanchik and Christian A. Lopez |
| `suomi-npp.glb` | [Suomi NPP](https://science.nasa.gov/3d-resources/suomi-national-polar-orbiting-partnership-suomi-npp/) | NASA / Brian E. Kumanchik and Christian A. Lopez |

Sozai Search MCP v0.2.2 retrieved the source GLBs from [NASA 3D Resources](https://github.com/nasa/NASA-3D-Resources/tree/11ebb4ee043715aefbba6aeec8a61746fad67fa7). The bundled models were aligned, centered and normalized to a unit span using glTF Transform. Their geometry is quantized for loading by three.js. The Earth-observation textures were resized to a maximum of 256 pixels per side, and Aqua's mesh was simplified with meshoptimizer.

For close views, the ISS and Aqua use the published [ISS wingspan](https://www.nasa.gov/reference/international-space-station/) and [Aqua deployed span](https://aqua.nasa.gov/content/about-aqua). Suomi NPP uses an approximate 9 m span based on its model proportions and [8 m solar array](https://ntrs.nasa.gov/citations/20180002828). The atlas uses a minimum screen size and an illustrative orientation for legibility.
