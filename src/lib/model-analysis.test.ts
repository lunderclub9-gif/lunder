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

  it('rejects unsupported file extensions', async () => {
    await expect(analyze3DModel(new File(['x'], 'model.zip'))).rejects.toThrow('Format non pris en charge')
  })
})