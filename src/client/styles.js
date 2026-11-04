/** Styles for the Provider Panel settings section.
 *
 * Everything is scoped under `.dpp-root` and built on DSW alias tokens, so the
 * page follows the Harness theme (light and dark) without hard-coded colours.
 * Every token keeps a literal fallback for hosts that do not define it.
 *
 * Scale: 13px body, 12px labels, 12.5px controls, 32px control height, 8px
 * control radius, 12px card radius. Motion uses one out-expo curve and three
 * durations (120/160/240ms) so every transition in the panel feels related.
 */
export const CSS = `
.dpp-root{
  --dpp-mono:var(--dsw-font-mono,ui-monospace,"SF Mono",SFMono-Regular,Menlo,Consolas,monospace);
  --dpp-fg:var(--dsw-alias-label-primary,#17181a);
  --dpp-fg2:var(--dsw-alias-label-secondary,#5b6070);
  --dpp-fg3:var(--dsw-alias-label-tertiary,#8a8f9d);
  --dpp-fg4:var(--dsw-alias-label-quaternary,#a8adba);
  --dpp-line:var(--dsw-alias-border-l2,#e3e5ea);
  --dpp-line1:var(--dsw-alias-border-l1,#eceef2);
  --dpp-line2:var(--dsw-alias-border-stronger,#c8ccd5);
  --dpp-surface:var(--dsw-alias-bg-layer-1,#ffffff);
  --dpp-surface2:var(--dsw-alias-bg-layer-2,#fafbfc);
  --dpp-fill:var(--dsw-alias-bg-layer-3,#f2f3f6);
  --dpp-hover:var(--dsw-alias-interactive-bg-hover,#f2f3f6);
  --dpp-hoverDanger:var(--dsw-alias-interactive-bg-hover-danger,rgba(198,40,40,.08));
  --dpp-brand:var(--dsw-alias-brand-primary,#3b6df5);
  --dpp-brandSoft:var(--dsw-alias-brand-primary-alpha-10,rgba(59,109,245,.1));
  --dpp-brandSoft2:var(--dsw-alias-brand-primary-alpha-15,rgba(59,109,245,.15));
  --dpp-brandFill:var(--dsw-alias-button-primary-fill,#0f1115);
  --dpp-brandHover:var(--dsw-alias-button-primary-hover,#0a0c10);
  --dpp-brandFg:var(--dsw-alias-label-primary-foreground,#ffffff);
  --dpp-ok:var(--dsw-alias-state-success-primary,#128a4a);
  --dpp-okLabel:var(--dsw-alias-state-success-label,#0f7b43);
  --dpp-okSoft:var(--dsw-alias-state-success-soft,rgba(18,138,74,.1));
  --dpp-bad:var(--dsw-alias-state-error-primary,#c62828);
  --dpp-badLabel:var(--dsw-alias-state-error-label,#b3261e);
  --dpp-badSoft:var(--dsw-alias-state-error-soft,rgba(198,40,40,.09));
  --dpp-warn:#a2620b;
  --dpp-overlay:rgba(12,14,18,.38);
  --dpp-shadow:0 24px 56px -20px rgba(16,20,30,.34),0 2px 8px rgba(16,20,30,.06);
  --dpp-shadowSm:0 2px 8px -2px rgba(16,20,30,.12);
  --dpp-r-lg:12px;--dpp-r:10px;--dpp-r-sm:8px;--dpp-r-xs:6px;
  --dpp-ease:cubic-bezier(.16,1,.3,1);
  --dpp-t-fast:.12s;--dpp-t:.16s;--dpp-t-slow:.24s;
  color:var(--dpp-fg);
  font-size:13px;line-height:1.5;
  max-width:760px;margin:0 auto;padding:2px 0 40px;
  -webkit-font-smoothing:antialiased;
}
.dpp-root *{box-sizing:border-box}
.dpp-root button,.dpp-root input{font-family:inherit}
.dpp-root h2,.dpp-root h3,.dpp-root h4{font-family:inherit}
.dpp-root ::selection{background:var(--dpp-brandSoft2)}
.dpp-i{display:block;flex:none}
.dpp-mono{font-family:var(--dpp-mono);font-size:11.5px;letter-spacing:-.01em}
.dpp-srOnly{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}

/* ------------------------------------------------------------------ motion */
@keyframes dppFadeIn{from{opacity:0}}
@keyframes dppFadeOut{to{opacity:0}}
@keyframes dppViewIn{from{opacity:0;transform:translateY(6px)}}
@keyframes dppViewBack{from{opacity:0;transform:translateY(-4px)}}
@keyframes dppRowIn{from{opacity:0;transform:translateY(3px)}}
@keyframes dppPopIn{from{opacity:0;transform:scale(.97) translateY(-3px)}}
@keyframes dppPop{0%{transform:scale(.8)}60%{transform:scale(1.08)}100%{transform:scale(1)}}
@keyframes dppModalIn{from{opacity:0;transform:translateY(8px) scale(.975)}}
@keyframes dppModalOut{to{opacity:0;transform:translateY(4px) scale(.985)}}
@keyframes dppToastIn{from{opacity:0;transform:translateY(10px) scale(.98)}}
@keyframes dppSpin{to{transform:rotate(360deg)}}
@keyframes dppShimmer{from{background-position:100% 0}to{background-position:-100% 0}}
.dpp-spin{animation:dppSpin .8s linear infinite}
.dpp-view{animation:dppViewIn var(--dpp-t-slow) var(--dpp-ease) backwards}
.dpp-view.is-back{animation-name:dppViewBack}

/* ------------------------------------------------------------------ header */
.dpp-pageHead{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:32px;margin-bottom:12px}
.dpp-pageTitle{display:flex;align-items:baseline;gap:8px;margin:0;font-size:17px;font-weight:650;letter-spacing:-.02em;line-height:1.3}
.dpp-pageCount{color:var(--dpp-fg4);font-size:12px;font-weight:500;letter-spacing:0}
.dpp-subHead{display:flex;flex-direction:column;gap:2px;margin-bottom:12px}
.dpp-subHeadTitle{display:flex;align-items:center;gap:8px}
.dpp-backBtn{display:inline-flex;align-items:center;gap:5px;align-self:flex-start;margin:0 0 10px -6px;padding:4px 6px;border:0;border-radius:6px;background:none;color:var(--dpp-fg2);font:inherit;font-size:12px;cursor:pointer;transition:background var(--dpp-t),color var(--dpp-t)}
.dpp-backBtn:hover{background:var(--dpp-hover);color:var(--dpp-fg)}
.dpp-backBtn:focus-visible{outline:2px solid var(--dpp-brand);outline-offset:2px}
.dpp-subHead .dpp-backBtn{margin-bottom:2px}

/* ----------------------------------------------------------------- buttons */
.dpp-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:30px;padding:0 11px;border:1px solid var(--dpp-line);border-radius:var(--dpp-r-sm);background:var(--dpp-surface);color:var(--dpp-fg);font:inherit;font-size:12.5px;font-weight:500;line-height:1;white-space:nowrap;cursor:pointer;transition:background var(--dpp-t),border-color var(--dpp-t),color var(--dpp-t),opacity var(--dpp-t),transform var(--dpp-t-fast)}
.dpp-btn:hover:not(:disabled){background:var(--dpp-hover);border-color:var(--dpp-line2)}
.dpp-btn:active:not(:disabled){transform:scale(.975)}
.dpp-btn:focus-visible{outline:2px solid var(--dpp-brand);outline-offset:2px}
.dpp-btn:disabled{opacity:.42;cursor:not-allowed}
.dpp-btnSm{height:26px;padding:0 9px;font-size:12px;border-radius:7px}
.dpp-btnGhost{border-color:transparent;background:transparent;color:var(--dpp-fg2)}
.dpp-btnGhost:hover:not(:disabled){background:var(--dpp-hover);border-color:transparent;color:var(--dpp-fg)}
.dpp-btnSecondary{border-color:transparent;background:var(--dpp-fill);color:var(--dpp-fg)}
.dpp-btnSecondary:hover:not(:disabled){background:var(--dpp-hover);border-color:transparent}
.dpp-btnPrimary{border-color:transparent;background:var(--dpp-brandFill);color:var(--dpp-brandFg)}
.dpp-btnPrimary:hover:not(:disabled){background:var(--dpp-brandHover);border-color:transparent}
.dpp-btnDanger{border-color:transparent;background:var(--dpp-bad);color:#fff}
.dpp-btnDanger:hover:not(:disabled){background:var(--dpp-bad);filter:brightness(.92);border-color:transparent}
.dpp-iconBtn{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border:0;border-radius:var(--dpp-r-sm);background:transparent;color:var(--dpp-fg3);cursor:pointer;transition:background var(--dpp-t),color var(--dpp-t),transform var(--dpp-t-fast)}
.dpp-iconBtn:hover:not(:disabled){background:var(--dpp-hover);color:var(--dpp-fg)}
.dpp-iconBtn:active:not(:disabled){transform:scale(.94)}
.dpp-iconBtn:focus-visible{outline:2px solid var(--dpp-brand);outline-offset:-1px}
.dpp-iconBtn:disabled{opacity:.38;cursor:not-allowed}
.dpp-iconBtn.is-xs{width:26px;height:26px;border-radius:7px}
.dpp-iconBtn.is-open{background:var(--dpp-hover);color:var(--dpp-fg)}
.dpp-iconBtn.is-danger:hover:not(:disabled){background:var(--dpp-hoverDanger);color:var(--dpp-bad)}
.dpp-linkBtn{border:0;background:none;padding:0;color:var(--dpp-brand);font:inherit;font-size:12px;cursor:pointer;transition:opacity var(--dpp-t)}
.dpp-linkBtn:hover{text-decoration:underline}
.dpp-linkBtn:disabled{opacity:.45;cursor:not-allowed}

/* ------------------------------------------------------------------ inputs */
.dpp-input{width:100%;height:32px;padding:0 10px;border:1px solid var(--dpp-line);border-radius:var(--dpp-r-sm);background:var(--dpp-surface);color:var(--dpp-fg);font:inherit;font-size:12.5px;line-height:normal;transition:border-color var(--dpp-t),box-shadow var(--dpp-t),background var(--dpp-t)}
.dpp-input::placeholder{color:var(--dpp-fg4)}
.dpp-input:hover:not(:disabled):not(:focus){border-color:var(--dpp-line2)}
.dpp-input:focus{outline:0;border-color:var(--dpp-brand);box-shadow:0 0 0 3px var(--dpp-brandSoft)}
.dpp-input:disabled{background:var(--dpp-surface2);color:var(--dpp-fg3);cursor:not-allowed}
.dpp-inputMono{font-family:var(--dpp-mono);font-size:12px;letter-spacing:-.01em}
.dpp-inputSearch{padding-left:30px;padding-right:30px}
.dpp-readonly{display:flex;align-items:center;min-height:32px;padding:0 10px;border:1px solid var(--dpp-line1);border-radius:var(--dpp-r-sm);background:var(--dpp-surface2);color:var(--dpp-fg2);font-size:12.5px}
.dpp-field{display:flex;flex-direction:column;gap:6px;min-width:0}
.dpp-field.is-wide{grid-column:1/-1}
.dpp-fieldLabel{display:flex;align-items:center;gap:8px;color:var(--dpp-fg2);font-size:12px;font-weight:500;letter-spacing:.01em}
.dpp-fieldLabelInline{justify-content:flex-start}
.dpp-fieldHint{color:var(--dpp-fg4);font-weight:400;font-size:11.5px}
.dpp-fieldHead{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:26px}
.dpp-fieldHeadActions{display:flex;align-items:center;gap:6px}
.dpp-count{display:inline-flex;align-items:center;height:16px;padding:0 5px;border-radius:5px;background:var(--dpp-fill);color:var(--dpp-fg3);font-size:10.5px;font-weight:500;font-family:inherit;letter-spacing:0}
.dpp-formGrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px 14px}

/* --------------------------------------------------------------- selectors */
.dpp-selectMenu{position:relative}
.dpp-selectTrigger{display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;height:32px;padding:0 10px;border:1px solid var(--dpp-line);border-radius:var(--dpp-r-sm);background:var(--dpp-surface);color:var(--dpp-fg);font:inherit;font-size:12.5px;text-align:left;cursor:pointer;transition:border-color var(--dpp-t),box-shadow var(--dpp-t),background var(--dpp-t)}
.dpp-selectTrigger:hover:not(:disabled):not(.is-open){border-color:var(--dpp-line2)}
.dpp-selectTrigger.is-open{border-color:var(--dpp-brand);box-shadow:0 0 0 3px var(--dpp-brandSoft)}
.dpp-selectTrigger:disabled{background:var(--dpp-surface2);color:var(--dpp-fg3);cursor:not-allowed}
.dpp-selectTrigger:focus-visible{outline:2px solid var(--dpp-brand);outline-offset:1px}
.dpp-selectValue{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dpp-selectChevron{color:var(--dpp-fg3);transition:transform var(--dpp-t) var(--dpp-ease)}
.dpp-selectTrigger.is-open .dpp-selectChevron{transform:rotate(180deg)}
.dpp-selectPopover{position:absolute;z-index:30;top:calc(100% + 4px);left:0;right:0;padding:4px;border:1px solid var(--dpp-line1);border-radius:var(--dpp-r);background:var(--dpp-surface);box-shadow:var(--dpp-shadow);animation:dppPopIn var(--dpp-t) var(--dpp-ease)}
.dpp-selectPopover.is-closing{animation:dppFadeOut var(--dpp-t-fast) ease-in forwards}
.dpp-selectOption{display:flex;align-items:center;gap:6px;width:100%;height:30px;padding:0 8px;border:0;border-radius:var(--dpp-r-xs);background:transparent;color:var(--dpp-fg);font:inherit;font-size:12.5px;text-align:left;cursor:pointer;transition:background var(--dpp-t-fast)}
.dpp-selectOption.is-active{background:var(--dpp-hover)}
.dpp-selectCheck{display:inline-flex;align-items:center;justify-content:center;width:14px;flex:none;color:var(--dpp-brand)}
.dpp-selectOptionLabel{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dpp-menuWrap{position:relative}
.dpp-menu{position:absolute;z-index:40;top:calc(100% + 4px);right:0;min-width:168px;padding:4px;border:1px solid var(--dpp-line1);border-radius:var(--dpp-r);background:var(--dpp-surface);box-shadow:var(--dpp-shadow);animation:dppPopIn var(--dpp-t) var(--dpp-ease)}
.dpp-menu.is-closing{animation:dppFadeOut var(--dpp-t-fast) ease-in forwards}
.dpp-menuItem{display:flex;align-items:center;gap:8px;width:100%;height:30px;padding:0 8px;border:0;border-radius:var(--dpp-r-xs);background:transparent;color:var(--dpp-fg);font:inherit;font-size:12.5px;text-align:left;cursor:pointer;transition:background var(--dpp-t-fast),color var(--dpp-t-fast)}
.dpp-menuItem svg{color:var(--dpp-fg3)}
.dpp-menuItem.is-active{background:var(--dpp-hover)}
.dpp-menuItem.is-danger{color:var(--dpp-bad)}
.dpp-menuItem.is-danger svg{color:var(--dpp-bad)}
.dpp-menuItem.is-danger.is-active{background:var(--dpp-hoverDanger)}

/* ------------------------------------------------------------------- cards */
.dpp-card{border:1px solid var(--dpp-line1);border-radius:var(--dpp-r-lg);background:var(--dpp-surface);box-shadow:0 1px 2px rgba(16,20,30,.035)}
.dpp-cardHead{display:flex;align-items:flex-start;gap:10px;padding:16px 12px 0 18px}
.dpp-cardHeadActions{display:flex;align-items:center;gap:4px;margin-left:auto}
.dpp-titleBlock{flex:1;min-width:0;padding-top:1px}
.dpp-title{display:inline-flex;align-items:center;gap:6px;max-width:100%;margin:0;padding:0;border:0;background:none;color:var(--dpp-fg);font:inherit;font-size:15px;font-weight:600;letter-spacing:-.015em;line-height:1.35;text-align:left;cursor:text;border-radius:4px}
.dpp-title:disabled{cursor:default}
.dpp-titleText{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dpp-titlePen{color:var(--dpp-fg4);opacity:0;transition:opacity var(--dpp-t)}
.dpp-title:hover:not(:disabled) .dpp-titlePen{opacity:1}
.dpp-title:focus-visible{outline:2px solid var(--dpp-brand);outline-offset:2px}
.dpp-titleInput{width:100%;height:26px;margin-left:-7px;padding:0 6px;border:1px solid var(--dpp-brand);border-radius:6px;background:var(--dpp-surface);color:var(--dpp-fg);font:inherit;font-size:15px;font-weight:600;letter-spacing:-.015em;outline:0;box-shadow:0 0 0 3px var(--dpp-brandSoft)}
.dpp-providerMeta{display:flex;align-items:center;gap:8px;margin-top:3px;color:var(--dpp-fg3);font-size:11.5px;min-width:0;overflow:hidden;white-space:nowrap}
.dpp-metaDot{width:3px;height:3px;border-radius:50%;background:var(--dpp-line2);flex:none}
.dpp-tag{display:inline-flex;align-items:center;height:18px;padding:0 6px;border-radius:5px;background:var(--dpp-fill);color:var(--dpp-fg3);font-size:10.5px;font-weight:500;letter-spacing:.01em}
.dpp-cardBody{display:flex;flex-direction:column;gap:14px;padding:16px 18px 18px}
.dpp-cardFoot{display:flex;align-items:center;gap:8px;padding:12px 16px;border-top:1px solid var(--dpp-line1)}
.dpp-dirty{margin-right:auto;color:var(--dpp-fg4);font-size:11.5px;opacity:0;transition:opacity var(--dpp-t),color var(--dpp-t)}
.dpp-dirty.is-on{opacity:1;color:var(--dpp-warn)}

/* ------------------------------------------------------------------- marks */
.dpp-mark{display:inline-flex;align-items:center;justify-content:center;flex:none;border-radius:6px;overflow:hidden;background:var(--dpp-surface)}
.dpp-mark img{display:block;width:100%;height:100%;object-fit:contain}
.dpp-markFallback{background:var(--dpp-fill);color:var(--dpp-fg3);box-shadow:inset 0 0 0 1px var(--dpp-line1)}
.dpp-markAdd{background:var(--dpp-brandSoft);color:var(--dpp-brand);box-shadow:none}

/* -------------------------------------------------------------------- list */
.dpp-list{display:flex;flex-direction:column;gap:2px;margin:0 -8px}
.dpp-row{display:flex;align-items:center;gap:10px;min-height:44px;padding:0 8px;border:0;border-radius:var(--dpp-r);background:transparent;color:var(--dpp-fg);font:inherit;font-size:13.5px;font-weight:500;text-align:left;cursor:pointer;animation:dppRowIn var(--dpp-t-slow) var(--dpp-ease) backwards;animation-delay:calc(var(--dpp-i,0) * 18ms);transition:background var(--dpp-t)}
.dpp-row:hover{background:var(--dpp-hover)}
.dpp-row:active{background:var(--dpp-fill)}
.dpp-row:focus-visible{outline:2px solid var(--dpp-brand);outline-offset:-2px}
.dpp-rowName{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dpp-rowChevron{color:var(--dpp-fg4);transition:transform var(--dpp-t) var(--dpp-ease),color var(--dpp-t)}
.dpp-row:hover .dpp-rowChevron{color:var(--dpp-fg3);transform:translateX(2px)}
.dpp-addRow{display:flex;align-items:center;gap:10px;height:44px;margin-top:2px;padding:0 8px;border:0;border-radius:var(--dpp-r);background:transparent;color:var(--dpp-fg2);font:inherit;font-size:13px;cursor:pointer;transition:background var(--dpp-t),color var(--dpp-t)}
.dpp-addRow:hover:not(:disabled){background:var(--dpp-hover);color:var(--dpp-fg)}
.dpp-addRow:focus-visible{outline:2px solid var(--dpp-brand);outline-offset:-2px}
.dpp-addRow:disabled{opacity:.45;cursor:not-allowed}
.dpp-addRowIcon{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;background:var(--dpp-fill);color:var(--dpp-fg2);transition:background var(--dpp-t),color var(--dpp-t)}
.dpp-addRow:hover:not(:disabled) .dpp-addRowIcon{background:var(--dpp-brandSoft);color:var(--dpp-brand)}

/* ------------------------------------------------------------------- empty */
.dpp-empty{display:flex;flex-direction:column;align-items:center;gap:8px;padding:40px 20px 44px;text-align:center}
.dpp-emptyIcon{display:inline-flex;align-items:center;justify-content:center;width:44px;height:44px;margin-bottom:2px;border-radius:12px;background:var(--dpp-fill);color:var(--dpp-fg3)}
.dpp-emptyTitle{font-size:13.5px;font-weight:600}
.dpp-emptyHint{max-width:340px;margin-bottom:8px;font-size:12px;line-height:1.6;color:var(--dpp-fg3)}

/* ------------------------------------------------------------------ badges */
.dpp-badge{display:inline-flex;align-items:center;height:20px;padding:0 6px;border-radius:5px;background:var(--dpp-fill);color:var(--dpp-fg2);font-size:10.5px;font-weight:500;letter-spacing:.01em;white-space:nowrap}
.dpp-badgeMono{font-family:var(--dpp-mono);font-size:10px;letter-spacing:-.01em;color:var(--dpp-fg3)}
.dpp-result{display:inline-flex;align-items:center;gap:4px;height:20px;padding:0 6px;border-radius:5px;font-size:10.5px;font-weight:500;white-space:nowrap;animation:dppFadeIn var(--dpp-t) var(--dpp-ease)}
.dpp-result.is-ok{background:var(--dpp-okSoft);color:var(--dpp-okLabel)}
.dpp-result.is-err{background:var(--dpp-badSoft);color:var(--dpp-badLabel)}

/* --------------------------------------------------------------- model list */
.dpp-modelBox{border:1px solid var(--dpp-line1);border-radius:var(--dpp-r);overflow:hidden;background:var(--dpp-surface)}
.dpp-modelRow{display:flex;align-items:center;gap:8px;min-height:40px;padding:0 6px 0 10px;animation:dppRowIn var(--dpp-t) var(--dpp-ease) backwards;animation-delay:calc(var(--dpp-i,0) * 12ms);transition:background var(--dpp-t-fast)}
.dpp-modelRow + .dpp-modelRow{border-top:1px solid var(--dpp-line1)}
.dpp-modelRow:hover{background:var(--dpp-surface2)}
.dpp-modelName{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:0;border:0;background:none;color:var(--dpp-fg);font-family:var(--dpp-mono);font-size:12px;letter-spacing:-.01em;text-align:left;cursor:pointer;transition:color var(--dpp-t)}
.dpp-modelName:hover:not(:disabled){color:var(--dpp-brand)}
.dpp-modelName:disabled{cursor:default}
.dpp-modelBadges{display:flex;align-items:center;gap:4px;flex:none}
.dpp-modelActions{display:flex;align-items:center;gap:1px;flex:none;margin-left:2px}
.dpp-modelEmpty{display:flex;align-items:center;gap:8px;min-height:52px;padding:0 12px;border:1px dashed var(--dpp-line);border-radius:var(--dpp-r);color:var(--dpp-fg3);font-size:12px}

/* ------------------------------------------------------------------- key UI */
.dpp-keyWrap{position:relative}
.dpp-keyInput{padding-right:86px}
.dpp-keyActions{position:absolute;top:50%;right:3px;transform:translateY(-50%);display:flex;align-items:center;gap:1px}
.dpp-keyState{margin-left:auto;display:inline-flex;align-items:center;gap:5px;color:var(--dpp-fg4);font-size:11px;font-weight:400;transition:color var(--dpp-t)}
.dpp-keyDot{width:5px;height:5px;border-radius:50%;background:var(--dpp-line2);transition:background var(--dpp-t),box-shadow var(--dpp-t)}
.dpp-keyState.is-on{color:var(--dpp-okLabel)}
.dpp-keyState.is-on .dpp-keyDot{background:var(--dpp-ok);box-shadow:0 0 0 2px var(--dpp-okSoft)}

/* ------------------------------------------------------------------- chips */
.dpp-chipRow{display:flex;flex-wrap:wrap;gap:6px}
.dpp-chip{display:inline-flex;align-items:center;gap:5px;height:28px;padding:0 10px;border:1px solid var(--dpp-line);border-radius:999px;background:var(--dpp-surface);color:var(--dpp-fg2);font:inherit;font-size:12px;cursor:pointer;transition:background var(--dpp-t),border-color var(--dpp-t),color var(--dpp-t)}
.dpp-chip:hover{border-color:var(--dpp-line2);color:var(--dpp-fg)}
.dpp-chip.is-on{border-color:transparent;background:var(--dpp-brandSoft);color:var(--dpp-brand);font-weight:500}
.dpp-chip:focus-visible{outline:2px solid var(--dpp-brand);outline-offset:2px}

/* ------------------------------------------------------------------ search */
.dpp-searchRow{position:relative;display:flex;align-items:center;padding:0 14px 10px}
.dpp-searchIcon{position:absolute;left:24px;top:15px;transform:translateY(-50%);color:var(--dpp-fg4);pointer-events:none}
.dpp-searchClear{position:absolute;right:22px;top:15px;transform:translateY(-50%);display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border:0;border-radius:50%;background:var(--dpp-fill);color:var(--dpp-fg3);cursor:pointer;transition:background var(--dpp-t),color var(--dpp-t)}
.dpp-searchClear:hover{background:var(--dpp-hover);color:var(--dpp-fg)}

/* ------------------------------------------------------------------ picker */
.dpp-pickList{flex:1;min-height:0;overflow:auto;padding:0 8px 8px;scrollbar-width:thin}
.dpp-pickRow{display:flex;align-items:center;gap:10px;min-height:36px;padding:0 10px;border-radius:var(--dpp-r-sm);cursor:pointer;transition:background var(--dpp-t-fast)}
.dpp-pickRow:hover{background:var(--dpp-surface2)}
.dpp-pickRow.is-selected{background:var(--dpp-brandSoft)}
.dpp-checkbox{display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;flex:none;border:1.5px solid var(--dpp-line2);border-radius:4.5px;background:var(--dpp-surface);color:#fff;transition:background var(--dpp-t),border-color var(--dpp-t)}
.dpp-pickRow:hover .dpp-checkbox{border-color:var(--dpp-fg4)}
.dpp-checkbox.is-on{background:var(--dpp-brand);border-color:var(--dpp-brand);animation:dppPop var(--dpp-t) var(--dpp-ease)}
.dpp-pickMain{display:flex;align-items:center;min-width:0;flex:1}
.dpp-pickId{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:var(--dpp-mono);font-size:12px;letter-spacing:-.01em}
.dpp-pickEmpty{display:flex;align-items:center;justify-content:center;gap:8px;padding:36px 0;color:var(--dpp-fg3);font-size:12px}

/* -------------------------------------------------------------------- tpls */
.dpp-tplSearch{margin:0 0 2px;padding:0 0 6px}
.dpp-tplSearch .dpp-searchIcon{left:10px}
.dpp-tplSearch .dpp-searchClear{right:8px}
.dpp-tplGroup{margin-top:16px}
.dpp-tplGroupTitle{display:flex;align-items:center;gap:6px;margin:0 0 8px;font-size:12px;font-weight:600;color:var(--dpp-fg2)}
.dpp-tplCount{display:inline-flex;align-items:center;height:16px;padding:0 5px;border-radius:5px;background:var(--dpp-fill);color:var(--dpp-fg4);font-size:10.5px;font-weight:500}
.dpp-tplGrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(228px,1fr));gap:6px}
.dpp-tplCard{display:flex;align-items:center;gap:10px;min-height:54px;padding:8px 10px;border:1px solid var(--dpp-line1);border-radius:var(--dpp-r);background:var(--dpp-surface);color:var(--dpp-fg);font:inherit;text-align:left;cursor:pointer;animation:dppRowIn var(--dpp-t) var(--dpp-ease) backwards;transition:border-color var(--dpp-t),box-shadow var(--dpp-t),transform var(--dpp-t)}
.dpp-tplCard:hover{border-color:var(--dpp-line2);box-shadow:var(--dpp-shadowSm);transform:translateY(-1px)}
.dpp-tplCard:active{transform:translateY(0) scale(.995)}
.dpp-tplCard:focus-visible{outline:2px solid var(--dpp-brand);outline-offset:1px}
.dpp-tplBody{display:flex;flex-direction:column;gap:1px;min-width:0;flex:1}
.dpp-tplName{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12.5px;font-weight:500}
.dpp-tplHost{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px;color:var(--dpp-fg4)}
.dpp-tplArrow{color:var(--dpp-fg4);opacity:0;transform:translateX(-2px);transition:opacity var(--dpp-t),transform var(--dpp-t),color var(--dpp-t)}
.dpp-tplCard:hover .dpp-tplArrow{opacity:1;transform:translateX(0);color:var(--dpp-fg3)}
.dpp-tplMore{display:flex;align-items:center;gap:4px;margin:8px auto 0;padding:4px 8px;border:0;border-radius:6px;background:none;color:var(--dpp-fg3);font:inherit;font-size:11.5px;cursor:pointer;transition:background var(--dpp-t),color var(--dpp-t)}
.dpp-tplMore:hover{background:var(--dpp-hover);color:var(--dpp-fg)}
.dpp-tplMoreCount{color:var(--dpp-fg4);font-size:10.5px}
.dpp-tplNoMatch{margin-top:28px}

/* ------------------------------------------------------------------ alerts */
.dpp-alert{display:flex;align-items:flex-start;gap:8px;margin-bottom:10px;padding:9px 11px;border-radius:var(--dpp-r-sm);background:var(--dpp-fill);color:var(--dpp-fg2);font-size:12px;line-height:1.55;animation:dppFadeIn var(--dpp-t) var(--dpp-ease)}
.dpp-alert > svg{margin-top:1px}
.dpp-alert.is-err{background:var(--dpp-badSoft);color:var(--dpp-badLabel)}
.dpp-alert.is-ok{background:var(--dpp-okSoft);color:var(--dpp-okLabel)}
.dpp-alertText{display:flex;flex-direction:column;gap:2px;min-width:0}
.dpp-alertDetail{color:var(--dpp-fg3);font-size:11.5px}

/* --------------------------------------------------------------- skeletons */
.dpp-skelRow{display:flex;align-items:center;gap:10px;height:44px;padding:0 8px}
.dpp-skelStack{display:flex;flex-direction:column;gap:8px;width:100%}
.dpp-skel{display:block;height:11px;border-radius:5px;background:linear-gradient(90deg,var(--dpp-fill) 25%,var(--dpp-surface2) 37%,var(--dpp-fill) 63%);background-size:400% 100%;animation:dppShimmer 1.4s ease infinite}
.dpp-skelMark{width:22px;height:22px;border-radius:6px;flex:none}

/* ------------------------------------------------------------------ modals */
.dpp-overlay{position:fixed;inset:0;z-index:80;display:flex;align-items:center;justify-content:center;padding:24px;background:var(--dpp-overlay);backdrop-filter:blur(2px);animation:dppFadeIn var(--dpp-t) var(--dpp-ease)}
.dpp-overlay.is-closing{animation:dppFadeOut var(--dpp-t-fast) ease-in forwards}
.dpp-modal{display:flex;flex-direction:column;width:min(520px,100%);max-height:calc(100vh - 96px);border:1px solid var(--dpp-line1);border-radius:var(--dpp-r-lg);background:var(--dpp-surface);box-shadow:var(--dpp-shadow);outline:0;animation:dppModalIn var(--dpp-t-slow) var(--dpp-ease)}
.dpp-modal.is-closing{animation:dppModalOut var(--dpp-t-fast) ease-in forwards}
.dpp-modalHead{display:flex;align-items:center;gap:8px;padding:14px 12px 8px 18px}
.dpp-modalTitle{flex:1;margin:0;font-size:14px;font-weight:600;letter-spacing:-.01em}
.dpp-modalBody{padding:2px 18px 18px;overflow:auto;scrollbar-width:thin}
.dpp-modalBodyFlush{display:flex;flex-direction:column;flex:1;min-height:0;padding:6px 0 0;overflow:hidden}
.dpp-modalFoot{display:flex;align-items:center;gap:8px;padding:12px 16px;border-top:1px solid var(--dpp-line1)}
.dpp-footGap{flex:1}
.dpp-modalConfirm{width:min(420px,100%)}
.dpp-confirmText{margin:0;font-size:12.5px;line-height:1.65;color:var(--dpp-fg2)}
.dpp-modalPick{width:min(560px,100%);height:min(600px,calc(100vh - 96px))}

/* ------------------------------------------------------------------ toasts */
.dpp-toasts{position:fixed;right:20px;bottom:20px;z-index:90;display:flex;flex-direction:column;gap:8px;max-width:min(340px,calc(100vw - 40px));pointer-events:none}
.dpp-toast{display:flex;align-items:flex-start;gap:9px;padding:10px 8px 10px 12px;border:1px solid var(--dpp-line1);border-radius:var(--dpp-r-lg);background:var(--dpp-surface);box-shadow:var(--dpp-shadow);pointer-events:auto;animation:dppToastIn var(--dpp-t-slow) var(--dpp-ease)}
.dpp-toastIcon{margin-top:1px}
.dpp-toast.is-ok .dpp-toastIcon{color:var(--dpp-ok)}
.dpp-toast.is-err .dpp-toastIcon{color:var(--dpp-bad)}
.dpp-toastBody{display:flex;flex-direction:column;gap:2px;min-width:0;flex:1}
.dpp-toastText{font-size:12.5px;font-weight:500;line-height:1.45}
.dpp-toastDetail{font-size:11.5px;line-height:1.5;color:var(--dpp-fg3);word-break:break-word}
.dpp-toastClose{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;flex:none;border:0;border-radius:6px;background:transparent;color:var(--dpp-fg4);cursor:pointer;transition:background var(--dpp-t),color var(--dpp-t)}
.dpp-toastClose:hover{background:var(--dpp-hover);color:var(--dpp-fg)}

/* ------------------------------------------------------------ reduced motion */
@media (prefers-reduced-motion: reduce){
  .dpp-root *,.dpp-root *::before,.dpp-root *::after{
    animation-duration:.01ms !important;
    animation-iteration-count:1 !important;
    animation-delay:0ms !important;
    transition-duration:.01ms !important;
  }
}
`
