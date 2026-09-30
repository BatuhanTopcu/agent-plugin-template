# Review checklist

- Does the change meet the requested behavior?
- Are input validation and error handling correct at trust boundaries?
- Are callers and configuration consistent with the change?
- Are secrets and private data kept out of output and source files?
- Do existing checks exercise the changed behavior?
- Can the implementation be made smaller without losing required behavior?
