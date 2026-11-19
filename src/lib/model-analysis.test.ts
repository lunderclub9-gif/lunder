import { describe, expect, it } from 'vitest'
import { analyze3DModel } from './model-analysis'

const tetraVertices = [
  'vertex 0 0 0', 'vertex 0 10 0', 'vertex 10 0 0',
  'vertex 0 0 0', 'vertex 10 0 0', 'vertex 0 0 10',
  'vertex 0 0 0', 'vertex 0 0 10', 'vertex 0 10 0',
  'vertex 10 0 0', 'vertex 0 10 0', 'vertex 0 0 10',
]

describe('analyze3DModel', () => {
  it('reads dimensions and mesh volume from an ASCII STL', async () => {
    const file = new File(['solid tetra\n' + tetraVertices.join('\n') + '\nendsolid tetra'], 'tetra.stl')
    const result = await analyze3DModel(file)
    expect(result.format).toBe('stl')
    expect(result.dimensionsMm).toEqual({ length: 10, width: 10, height: 10 })
    expect(result.triangleCount).toBe(4)
    expect(result.meshVolumeCm3).toBeCloseTo(1 / 6, 2)
    expect(result.vertexCount).toBe(12)
    expect(result.componentCount).toBe(1)
  })

  it('reads vertices and triangulates polygon faces in OBJ', async () => {
    const source = [
      'v 0 0 0', 'v 10 0 0', 'v 0 10 0', 'v 0 0 10',
      'f 1 3 2', 'f 1 2 4', 'f 1 4 3', 'f 2 3 4',
    ].join('\n')
    const result = await analyze3DModel(new File([source], 'tetra.obj'))
    expect(result.format).toBe('obj')
    expect(result.dimensionsMm).toEqual({ length: 10, width: 10, height: 10 })
    expect(result.triangleCount).toBe(4)
    expect(result.meshVolumeCm3).toBeCloseTo(1 / 6, 2)
    expect(result.componentCount).toBeNull()
  })


  it('reads dimensions and mesh volume from a self-contained glTF file', async () => {
    const positions = new Float32Array([
      0, 0, 0, 0.01, 0, 0, 0, 0.01, 0, 0, 0, 0.01,
    ])
    const indices = new Uint16Array([0, 2, 1, 0, 1, 3, 0, 3, 2, 1, 2, 3])
    const bytes = new Uint8Array(positions.byteLength + indices.byteLength)
    bytes.set(new Uint8Array(positions.buffer), 0)
    bytes.set(new Uint8Array(indices.buffer), positions.byteLength)
    const binary = btoa(Array.from(bytes, (value) => String.fromCharCode(value)).join(''))
    const document = {
      asset: { version: '2.0' },
      buffers: [{ byteLength: bytes.byteLength, uri: `data:application/octet-stream;base64,${binary}` }],
      bufferViews: [
        { buffer: 0, byteOffset: 0, byteLength: positions.byteLength },
        { buffer: 0, byteOffset: positions.byteLength, byteLength: indices.byteLength },
      ],
      accessors: [
        { bufferView: 0, componentType: 5126, count: 4, type: 'VEC3' },
        { bufferView: 1, componentType: 5123, count: 12, type: 'SCALAR' },
      ],
      meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
      nodes: [{ mesh: 0 }],
    }
    const result = await analyze3DModel(new File([JSON.stringify(document)], 'tetra.gltf'))
    expect(result.format).toBe('gltf')
    expect(result.dimensionsMm).toEqual({ length: 10, width: 10, height: 10 })
    expect(result.triangleCount).toBe(4)
    expect(result.meshVolumeCm3).toBeCloseTo(1 / 6, 2)
    expect(result.componentCount).toBe(1)
  })

  it('rejects glTF models with unapplied scene transforms', async () => {
    const document = { nodes: [{ translation: [1, 0, 0] }] }
    await expect(analyze3DModel(new File([JSON.stringify(document)], 'transformed.gltf')))
      .rejects.toThrow('transformations')
  })

  it('rejects unsupported file extensions', async () => {
    await expect(analyze3DModel(new File(['x'], 'model.zip'))).rejects.toThrow('Format non pris en charge')
  })
})