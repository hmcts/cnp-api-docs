workspace {
    model {
        !include ../hmcts.mdsl
    }

    views {
        !include ../hmcts.vdsl

        systemContext pre "pre-context" {
            include *
            exclude idam
            exclude rpe
            exclude relationship==bsp->*
            autoLayout
        }

        container pre "pre-overview" {
            include *
            exclude idam
            exclude rpe
            exclude relationship==bsp->*
            autoLayout
        }
    }
}
