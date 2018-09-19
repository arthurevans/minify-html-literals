import { expect } from 'chai';
import MagicString, { SourceMapOptions } from 'magic-string';
import {
  ParseLiteralsOptions,
  Template,
  TemplatePart,
  parseLiterals
} from 'parse-literals';
import { SinonSpy, spy } from 'sinon';
import {
  SourceMap,
  defaultGenerateSourceMap,
  defaultShouldMinify,
  defaultValidation,
  minifyHTMLLiterals
} from '../src/minifyHTMLLiterals';
import { defaultMinifyOptions, defaultStrategy } from '../src/strategy';

class MagicStringLike {
  generateMap(options?: Partial<SourceMapOptions>): SourceMap {
    return {
      version: 3,
      file: (options && options.file) || null,
      sources: [(options && options.source) || null],
      sourcesContent: [],
      names: [],
      mappings: '',
      toString() {
        return '';
      },
      toUrl() {
        return '';
      }
    };
  }

  overwrite(_start: number, _end: number, _content: string): any {
    // noop
  }

  toString(): string {
    return '';
  }
}

describe('minifyHTMLLiterals()', () => {
  const SOURCE = `
    function render(title, items) {
      return html\`
        <h1 class="heading">\${title}</h1>
        <ul>
          \${items.map(item => {
            return getHTML()\`
              <li>\${item}</li>
            \`;
          })}
        </ul>
      \`;
    }

    function noMinify() {
      return \`
        <div>Not tagged html</div>
      \`;
    }

    function taggednoMinify() {
      return css\`
        <style>
          .heading {
            font-size: 24px;
          }
        </style>
      \`;
    }
  `;

  const SOURCE_MIN = `
    function render(title, items) {
      return html\`<h1 class=heading>\${title}</h1><ul>\${items.map(item => {
            return getHTML()\`<li>\${item}</li>\`;
          })}</ul>\`;
    }

    function noMinify() {
      return \`
        <div>Not tagged html</div>
      \`;
    }

    function taggednoMinify() {
      return css\`
        <style>
          .heading {
            font-size: 24px;
          }
        </style>
      \`;
    }
  `;

  it('should minify "html" tagged templates only', () => {
    const result = minifyHTMLLiterals(SOURCE, { fileName: 'test.js' });
    expect(result).to.be.an('object');
    expect(result!.code).to.equal(SOURCE_MIN);
  });

  it('should return null if source is already minified', () => {
    const result = minifyHTMLLiterals(SOURCE_MIN, { fileName: 'test.js' });
    expect(result).to.be.null;
  });

  it('should return a v3 source map', () => {
    const result = minifyHTMLLiterals(SOURCE, { fileName: 'test.js' });
    expect(result).to.be.an('object');
    expect(result!.map).to.be.an('object');
    expect(result!.map!.version).to.equal(3);
    expect(result!.map!.mappings).to.be.a('string');
  });

  describe('options', () => {
    let minifyHTMLSpy: SinonSpy;

    beforeEach(() => {
      minifyHTMLSpy = spy(defaultStrategy, 'minifyHTML');
    });

    afterEach(() => {
      minifyHTMLSpy.restore();
    });

    it('should use defaultMinifyOptions', () => {
      minifyHTMLLiterals(SOURCE, { fileName: 'test.js' });
      const parts = parseLiterals(SOURCE)[1].parts;
      const html = defaultStrategy.combineHTMLStrings(
        parts,
        defaultStrategy.getPlaceholder(parts)
      );
      expect(
        minifyHTMLSpy.lastCall.calledWithExactly(html, defaultMinifyOptions)
      ).to.be.true;
    });

    it('should allow custom minifyOptions', () => {
      const minifyOptions = { caseSensitive: false };
      minifyHTMLLiterals(SOURCE, { fileName: 'test.js', minifyOptions });
      const parts = parseLiterals(SOURCE)[1].parts;
      const html = defaultStrategy.combineHTMLStrings(
        parts,
        defaultStrategy.getPlaceholder(parts)
      );
      expect(minifyHTMLSpy.lastCall.calledWithExactly(html, minifyOptions)).to
        .be.true;
    });

    it('should use MagicString constructor', () => {
      let msUsed;
      minifyHTMLLiterals(SOURCE, {
        fileName: 'test.js',
        generateSourceMap(ms) {
          msUsed = ms;
          return undefined;
        }
      });

      expect(msUsed).to.be.an.instanceof(MagicString);
    });

    it('should allow custom MagicStringLike constructor', () => {
      let msUsed;
      minifyHTMLLiterals(SOURCE, {
        fileName: 'test.js',
        MagicString: MagicStringLike,
        generateSourceMap(ms) {
          msUsed = ms;
          return undefined;
        }
      });

      expect(msUsed).to.be.an.instanceof(MagicStringLike);
    });

    it('should allow custom parseLiterals()', () => {
      const customParseLiterals = spy(
        (source: string, options?: ParseLiteralsOptions) => {
          return parseLiterals(source, options);
        }
      );

      minifyHTMLLiterals(SOURCE, {
        fileName: 'test.js',
        parseLiterals: customParseLiterals
      });
      expect(customParseLiterals.called).to.be.true;
    });

    it('should allow custom shouldMinify()', () => {
      const customShouldMinify = spy((template: Template) => {
        return defaultShouldMinify(template);
      });

      minifyHTMLLiterals(SOURCE, {
        fileName: 'test.js',
        shouldMinify: customShouldMinify
      });
      expect(customShouldMinify.called).to.be.true;
    });

    it('should allow custom strategy', () => {
      const customStrategy = {
        getPlaceholder: spy((parts: TemplatePart[]) => {
          return defaultStrategy.getPlaceholder(parts);
        }),
        combineHTMLStrings: spy(
          (parts: TemplatePart[], placeholder: string) => {
            return defaultStrategy.combineHTMLStrings(parts, placeholder);
          }
        ),
        minifyHTML: spy((html: string, options?: any) => {
          return defaultStrategy.minifyHTML(html, options);
        }),
        splitHTMLByPlaceholder: spy((html: string, placeholder: string) => {
          return defaultStrategy.splitHTMLByPlaceholder(html, placeholder);
        })
      };

      minifyHTMLLiterals(SOURCE, {
        fileName: 'test.js',
        strategy: customStrategy
      });
      expect(customStrategy.getPlaceholder.called).to.be.true;
      expect(customStrategy.combineHTMLStrings.called).to.be.true;
      expect(customStrategy.minifyHTML.called).to.be.true;
      expect(customStrategy.splitHTMLByPlaceholder.called).to.be.true;
    });

    it('should use defaultValidation', () => {
      expect(() => {
        minifyHTMLLiterals(SOURCE, {
          fileName: 'test.js',
          strategy: {
            getPlaceholder: () => {
              return ''; // cause an error
            },
            combineHTMLStrings: defaultStrategy.combineHTMLStrings,
            minifyHTML: defaultStrategy.minifyHTML,
            splitHTMLByPlaceholder: defaultStrategy.splitHTMLByPlaceholder
          }
        });
      }).to.throw;

      expect(() => {
        minifyHTMLLiterals(SOURCE, {
          fileName: 'test.js',
          strategy: {
            getPlaceholder: defaultStrategy.getPlaceholder,
            combineHTMLStrings: defaultStrategy.combineHTMLStrings,
            minifyHTML: defaultStrategy.minifyHTML,
            splitHTMLByPlaceholder: () => {
              return []; // cause an error
            }
          }
        });
      }).to.throw;
    });

    it('should allow disabling validation', () => {
      expect(() => {
        minifyHTMLLiterals(SOURCE, {
          fileName: 'test.js',
          strategy: {
            getPlaceholder: () => {
              return ''; // cause an error
            },
            combineHTMLStrings: defaultStrategy.combineHTMLStrings,
            minifyHTML: defaultStrategy.minifyHTML,
            splitHTMLByPlaceholder: defaultStrategy.splitHTMLByPlaceholder
          },
          validate: false
        });
      }).not.to.throw;
    });

    it('should allow custom validation', () => {
      const customValidation = {
        ensurePlaceholderValid: spy((placeholder: any) => {
          return defaultValidation.ensurePlaceholderValid(placeholder);
        }),
        ensureHTMLPartsValid: spy(
          (parts: TemplatePart[], htmlParts: string[]) => {
            return defaultValidation.ensureHTMLPartsValid(parts, htmlParts);
          }
        )
      };

      minifyHTMLLiterals(SOURCE, {
        fileName: 'test.js',
        validate: customValidation
      });
      expect(customValidation.ensurePlaceholderValid.called).to.be.true;
      expect(customValidation.ensureHTMLPartsValid.called).to.be.true;
    });

    it('should allow disabling generateSourceMap', () => {
      const result = minifyHTMLLiterals(SOURCE, {
        fileName: 'test.js',
        generateSourceMap: false
      });
      expect(result).to.be.an('object');
      expect(result!.map).to.be.undefined;
    });

    it('should allow custom generateSourceMap()', () => {
      const customGenerateSourceMap = spy(
        (ms: MagicStringLike, fileName: string) => {
          return defaultGenerateSourceMap(ms, fileName);
        }
      );

      minifyHTMLLiterals(SOURCE, {
        fileName: 'test.js',
        generateSourceMap: customGenerateSourceMap
      });
      expect(customGenerateSourceMap.called).to.be.true;
    });
  });

  describe('defaultGenerateSourceMap()', () => {
    it('should call generateMap() on MagicStringLike with .map file, source name, and hires', () => {
      const ms = new MagicStringLike();
      const generateMapSpy = spy(ms, 'generateMap');
      defaultGenerateSourceMap(ms, 'test.js');
      expect(
        generateMapSpy.calledWith({
          file: 'test.js.map',
          source: 'test.js',
          hires: true
        })
      ).to.be.true;
    });
  });

  describe('defaultShouldMinify()', () => {
    it('should return true if the template is tagged with any "html" text', () => {
      expect(defaultShouldMinify({ tag: 'html', parts: [] })).to.be.true;
      expect(defaultShouldMinify({ tag: 'HTML', parts: [] })).to.be.true;
      expect(defaultShouldMinify({ tag: 'hTML', parts: [] })).to.be.true;
      expect(defaultShouldMinify({ tag: 'getHTML()', parts: [] })).to.be.true;
      expect(defaultShouldMinify({ tag: 'templateHtml()', parts: [] })).to.be
        .true;
    });

    it('should return false if the template is not tagged or does not contain "html"', () => {
      expect(defaultShouldMinify({ parts: [] })).to.be.false;
      expect(defaultShouldMinify({ tag: 'css', parts: [] })).to.be.false;
    });
  });

  describe('defaultValidation', () => {
    describe('ensurePlaceholderValid()', () => {
      it('should throw an error if the placeholder is not a string', () => {
        expect(() => {
          defaultValidation.ensurePlaceholderValid(undefined);
        }).to.throw;
        expect(() => {
          defaultValidation.ensurePlaceholderValid(true);
        }).to.throw;
        expect(() => {
          defaultValidation.ensurePlaceholderValid({});
        }).to.throw;
      });

      it('should throw an error if the placeholder is an empty string', () => {
        expect(() => {
          defaultValidation.ensurePlaceholderValid('');
        }).to.throw;
      });

      it('should not throw an error if the placeholder is a non-empty string', () => {
        expect(() => {
          defaultValidation.ensurePlaceholderValid('EXP');
        }).not.to.throw;
      });
    });
  });
});
