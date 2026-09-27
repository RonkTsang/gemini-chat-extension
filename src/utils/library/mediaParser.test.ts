import { describe, expect, it } from 'vitest'
import fixture from '@/entrypoints/content/stuff-page/__fixtures__/library-query.json'
import { isLibraryMediaRequest, LIBRARY_QUERY_PATH, parseLibraryMediaResponse } from './mediaParser'

describe('Library GraphQL media parser', () => {
  it('reads the captured array envelope, music and image thumbnails, and r_ navigation identifiers', () => {
    const items = parseLibraryMediaResponse(JSON.stringify(fixture))
    expect(items).toHaveLength(2)
    expect(items?.[0]).toMatchObject({
      conversationId: 'c_abc123', requestId: 'r_111aaa', responseId: 'rc_0',
      artifactType: 'TYPE_MY_STUFF_GENERATED_MUSIC',
      thumbnailUrl: 'https://lh3.googleusercontent.com/gg/musicResource',
    })
    expect(items?.[1].artifactType).toBe('TYPE_MY_STUFF_GENERATED_IMAGE')
  })

  it('keeps valid records when another node is incomplete, and allows missing thumbnails', () => {
    const node = fixture[0].data.viewer.media.edges[0].node
    const response = [{ data: { viewer: { media: { edges: [
      { node: { ...node, metadata: null } },
      { node: { ...node, responseIdentifier: { conversationId: 'c_valid' } } },
      { node: { ...node, responseIdentifier: { conversationId: 'c_/bad', requestId: 'r_good' } } },
    ] } } } }]
    const items = parseLibraryMediaResponse(JSON.stringify(response))
    expect(items).toHaveLength(1)
    expect(items?.[0].thumbnailUrl).toBeUndefined()
  })

  it('ignores unrelated queries and invalid JSON, while accepting an empty media list', () => {
    expect(parseLibraryMediaResponse('not json')).toBeNull()
    expect(parseLibraryMediaResponse(JSON.stringify([{ data: { viewer: { documents: { edges: [] } } } }]))).toBeNull()
    expect(parseLibraryMediaResponse(JSON.stringify([{ data: { viewer: { media: { edges: [] } } } }]))).toEqual([])
  })

  it('matches the exact Gemini endpoint independently of signature, query order and page route', () => {
    expect(isLibraryMediaRequest(`${LIBRARY_QUERY_PATH}?variables={}&query_signature=changed`)).toBe(true)
    expect(isLibraryMediaRequest(`https://example.com${LIBRARY_QUERY_PATH}`)).toBe(false)
    expect(isLibraryMediaRequest(`${LIBRARY_QUERY_PATH}Other`)).toBe(false)
  })
})
