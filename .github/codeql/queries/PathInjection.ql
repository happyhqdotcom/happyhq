/**
 * @name Uncontrolled data used in path expression
 * @description Same analysis as the standard js/path-injection, with HappyHQ's
 *              local path-helpers recognised as sanitisers — their return
 *              values are validated paths:
 *                - `safePath()` — canonical resolve + root-bounded
 *                - `assertSafeTaskSlug` / `assertSafeStreamName` /
 *                  `assertSafeSessionId` / `assertSafePathSegment` — regex
 *                  validators that return their input on success, throw on
 *                  bad input
 *                - `streamPath` / `taskPath` / `chatPath` — build paths
 *                  through the assertSafe* validators
 *              Replaces the default query (excluded via query-filters in
 *              codeql-config.yml).
 * @kind path-problem
 * @problem.severity error
 * @security-severity 7.5
 * @precision high
 * @id js/happyhq/path-injection
 * @tags security
 *       external/cwe/cwe-022
 *       external/cwe/cwe-023
 *       external/cwe/cwe-036
 *       external/cwe/cwe-073
 *       external/cwe/cwe-099
 */

import javascript
import semmle.javascript.security.dataflow.TaintedPathCustomizations
import semmle.javascript.security.dataflow.TaintedPathQuery
import DataFlow::DeduplicatePathGraph<TaintedPathFlow::PathNode, TaintedPathFlow::PathGraph>

private class HappyHQPathHelperSanitizer extends TaintedPath::Sanitizer {
  HappyHQPathHelperSanitizer() {
    exists(DataFlow::CallNode call |
      call.getCalleeName() =
        [
          "safePath", "assertSafeTaskSlug", "assertSafeStreamName",
          "assertSafeSessionId", "assertSafePathSegment", "streamPath", "taskPath",
          "chatPath"
        ] and
      this = call
    )
  }
}

from PathNode source, PathNode sink
where
  TaintedPathFlow::flowPath(source.getAnOriginalPathNode(), sink.getAnOriginalPathNode())
select sink.getNode(), source, sink, "This path depends on a $@.", source.getNode(),
  "user-provided value"
