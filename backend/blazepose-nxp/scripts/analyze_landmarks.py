import json, math
import numpy as np
from pathlib import Path
import statistics as stats

def main(a_path='yoga1_landmarks.json', b_path='sample-output.json'):
    p1=Path(a_path); p2=Path(b_path)
    print('Files:', p1.exists(), p2.exists())
    a=json.load(open(p1,'r'))
    b=json.load(open(p2,'r'))
    names_ref=[kp['name'] for kp in b['keypoints']]
    name_to_idx={n:i for i,n in enumerate(names_ref)}
    kps_a=sorted(a['keypoints'], key=lambda k: name_to_idx.get(k['name'],10**9))
    if [k['name'] for k in kps_a] != names_ref:
        raise SystemExit('Keypoint names differ or ordering mismatch')
    Axy=np.array([[k['x'],k['y']] for k in kps_a], float)
    Bxy=np.array([[k['x'],k['y']] for k in b['keypoints']], float)
    Az=np.array([k.get('z',0.0) for k in kps_a], float)
    Bz=np.array([k.get('z',0.0) for k in b['keypoints']], float)

    # XY errors
    D=Axy-Bxy
    e=np.sqrt((D**2).sum(1))
    order=np.argsort(-e)
    print('\nTop-10 XY pixel errors:')
    for i in order[:10]:
        print(f"{names_ref[i]:18s} err={e[i]:7.2f} (dx={D[i,0]:7.2f}, dy={D[i,1]:7.2f})")
    print(f"\nSummary XY error: mean={e.mean():.2f}, median={np.median(e):.2f}, max={e.max():.2f} ({names_ref[order[0]]})")

    GROUPS={
        'upper': {'left_shoulder','right_shoulder','left_elbow','right_elbow','left_wrist','right_wrist','left_eye','right_eye','nose','left_ear','right_ear','mouth_left','mouth_right'},
        'torso': {'left_shoulder','right_shoulder','left_hip','right_hip'},
        'lower': {'left_hip','right_hip','left_knee','right_knee','left_ankle','right_ankle','left_heel','right_heel','left_foot_index','right_foot_index'},
    }
    print('\nRegion XY error stats (mean, median, max):')
    for g,names in GROUPS.items():
        idx=[i for i,n in enumerate(names_ref) if n in names]
        vals=e[idx]
        print(f"{g:6s} mean={vals.mean():.2f} median={np.median(vals):.2f} max={vals.max():.2f}")

    # Z analysis
    def vec_stats(v):
        return dict(min=float(v.min()), max=float(v.max()), mean=float(v.mean()), std=float(v.std()))
    print('\nZ stats ours:', vec_stats(Az))
    print('Z stats ref :', vec_stats(Bz))
    A1=np.vstack([Az, np.ones_like(Az)]).T
    s,t=np.linalg.lstsq(A1, Bz, rcond=None)[0]
    pred=s*Az+t
    rmse=float(np.sqrt(np.mean((pred-Bz)**2)))
    corr=float(np.corrcoef(Az,Bz)[0,1]) if Az.std()>0 and Bz.std()>0 else float('nan')
    print(f"Z linear map ref ≈ {s:.3f}*ours + {t:.3f}, RMSE={rmse:.3f}, corr={corr:.3f}")

    # Similarity transform A->B
    muA=Axy.mean(0); muB=Bxy.mean(0)
    A0=Axy-muA; B0=Bxy-muB
    C=(A0.T@B0)/len(Axy)
    U,Sig,Vt=np.linalg.svd(C)
    R=U@Vt
    if np.linalg.det(R)<0:
        Vt[-1,:]*=-1
        R=U@Vt
    varA=(A0**2).sum()/len(Axy)
    s_scale=float(np.trace(np.diag(Sig))/varA)
    angle=float(math.degrees(math.atan2(R[1,0], R[0,0])))
    A_align = s_scale*(A0@R.T)+muB
    res=np.linalg.norm(A_align-Bxy, axis=1)
    print(f"\nBest-fit similarity A->B: scale={s_scale:.4f}, rot={angle:.2f} deg")
    print(f"Residuals after alignment: mean={res.mean():.2f}, median={np.median(res):.2f}, max={res.max():.2f}")
    idx_sorted=np.argsort(-res)[:10]
    print('Top-10 residual keypoints:')
    for i in idx_sorted:
        print(f"{names_ref[i]:18s} res={res[i]:7.2f}")

if __name__=='__main__':
    main()

